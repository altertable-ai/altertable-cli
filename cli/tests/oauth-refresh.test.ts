import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exchangeCode } from "@/lib/oauth-flow.ts";
import {
  ensureFreshAccessToken,
  storeOAuthTokens,
  getStoredAccessToken,
} from "@/lib/oauth-profile.ts";
import { getManagementAuthHeader } from "@/lib/auth.ts";
import { configGet, configSet } from "@/lib/config.ts";
import { secretSet } from "@/lib/secrets.ts";
import { setCliContext, getCliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { createCliRuntime, refreshCliRuntimeContext, runWithCliRuntime } from "@/lib/runtime.ts";

let testHome = "";
let mockFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-oauth-refresh-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = "http://localhost:13000";
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
});

describe("exchangeCode", () => {
  test("posts the authorization_code grant and returns tokens", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/oauth/token",
          method: "POST",
          body: '{"access_token":"acc","token_type":"Bearer","refresh_token":"ref","expires_in":3600}',
        },
      ]),
    );
    const tokens = await exchangeCode({
      code: "c",
      redirectUri: "http://127.0.0.1:5000/callback",
      verifier: "v",
    });
    expect(tokens.access_token).toBe("acc");
    expect(tokens.refresh_token).toBe("ref");
  });
});

describe("ensureFreshManagementToken", () => {
  test("no-op when not logged in via OAuth", async () => {
    expect(await ensureFreshAccessToken()).toBe(false);
  });

  test("no-op when the token is still fresh", async () => {
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
    expect(await ensureFreshAccessToken()).toBe(false);
  });

  test("refreshes and persists when expired", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/oauth/token",
          method: "POST",
          body: '{"access_token":"acc2","token_type":"Bearer","refresh_token":"ref2","expires_in":3600}',
        },
      ]),
    );
    secretSet("oauth/refresh-token", "ref");
    configSet("oauth_expiry", String(Date.now() - 1000));

    expect(await ensureFreshAccessToken()).toBe(true);
    expect(getStoredAccessToken()).toBe("acc2");
    expect(Number.parseInt(configGet("oauth_expiry"), 10)).toBeGreaterThan(Date.now());
  });

  test("clears tokens and throws when refresh fails", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/oauth/token",
          method: "POST",
          status: 400,
          body: '{"error":"invalid_grant"}',
        },
      ]),
    );
    secretSet("oauth/access-token", "acc");
    secretSet("oauth/refresh-token", "ref");
    configSet("oauth_expiry", String(Date.now() - 1000));

    let caught: unknown;
    try {
      await ensureFreshAccessToken();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigurationError);
    expect(getStoredAccessToken()).toBe("");
  });
});

describe("transport refresh preflight", () => {
  test("a management request refreshes an expired OAuth token before sending", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/oauth/token",
          method: "POST",
          body: '{"access_token":"acc3","token_type":"Bearer","refresh_token":"ref3","expires_in":3600}',
        },
        { urlPattern: "/whoami", method: "GET", body: '{"principal":{},"organization":{}}' },
      ]),
    );
    secretSet("oauth/access-token", "stale");
    secretSet("oauth/refresh-token", "ref");
    configSet("oauth_expiry", String(Date.now() - 1000));

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    await runWithCliRuntime(runtime, async () => {
      refreshCliRuntimeContext(getCliContext());
      await managementRequest("GET", "/whoami");
    });

    expect(getStoredAccessToken()).toBe("acc3");
    expect(Number.parseInt(configGet("oauth_expiry"), 10)).toBeGreaterThan(Date.now());
  });
});

describe("FIX 1 — env API key short-circuits refresh", () => {
  test("ensureFreshManagementToken returns false without attempting refresh when ALTERTABLE_API_KEY is set", async () => {
    // Arrange: expired OAuth session + no /oauth/token mock (would throw if called)
    secretSet("oauth/refresh-token", "ref");
    configSet("oauth_expiry", String(Date.now() - 1000));
    const tokenBefore = getStoredAccessToken();

    process.env.ALTERTABLE_API_KEY = "atm_env";
    try {
      const result = await ensureFreshAccessToken();
      expect(result).toBe(false);
      // Tokens must not have been cleared
      expect(getStoredAccessToken()).toBe(tokenBefore);
    } finally {
      delete process.env.ALTERTABLE_API_KEY;
    }
  });
});

describe("FIX 2 — live resolution when OAuth session is active", () => {
  test("management request uses current stored token even when no refresh occurred in this call", async () => {
    // Arrange: fresh OAuth session (no refresh needed)
    storeOAuthTokens({ access_token: "tok_a", refresh_token: "r", expires_in: 3600 });

    writeFileSync(
      mockFile,
      JSON.stringify([
        { urlPattern: "/whoami", method: "GET", body: '{"principal":{},"organization":{}}' },
      ]),
    );

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    await runWithCliRuntime(runtime, async () => {
      refreshCliRuntimeContext(getCliContext());
      // Simulate an out-of-band token rotation (e.g., a prior refresh in this process)
      secretSet("oauth/access-token", "tok_b");
      // The request must succeed and resolve live from the store, not the bootstrap cache
      await managementRequest("GET", "/whoami");
    });

    // Live resolution: header now reflects the rotated token
    expect(getManagementAuthHeader()).toBe("Authorization: Bearer tok_b");
  });
});
