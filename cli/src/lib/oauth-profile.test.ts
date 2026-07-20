import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exchangeCode } from "@/lib/oauth-flow.ts";
import { ensureFreshAccessToken, storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { getManagementAuthHeader } from "@/lib/auth.ts";
import { configGet, configSet, resolveOAuthBase } from "@/lib/config.ts";
import { secretGet, secretSet } from "@/lib/secrets.ts";
import { setCliContext, getCliContext } from "@/context.ts";
import { ConfigurationError, HttpError, NetworkError } from "@/lib/errors.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { createCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

const profileName = "default";
let testHome = "";
let mockFile = "";

function storedAccessToken(): string {
  return secretGet("oauth/access-token", profileName);
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-oauth-refresh-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  // No ALTERTABLE_MANAGEMENT_API_BASE: it would trigger env-config isolation
  // (`_from_env`) and bypass the stored-profile OAuth session these tests set up.
  // The mock intercepts by URL substring regardless of host.
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  // Individual tests may set this to exercise endpoint overrides; always clean up
  // so it can't leak into later tests and trip env-config isolation.
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_API_KEY;
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
    const tokens = await exchangeCode(
      {
        code: "c",
        redirectUri: "http://127.0.0.1:5000/callback",
        verifier: "v",
      },
      resolveOAuthBase(profileName),
    );
    expect(tokens.access_token).toBe("acc");
    expect(tokens.refresh_token).toBe("ref");
  });
});

describe("ensureFreshAccessToken", () => {
  test("no-op when not logged in via OAuth", async () => {
    await ensureFreshAccessToken(profileName);
    expect(storedAccessToken()).toBe(""); // nothing stored, nothing refreshed
  });

  test("no-op when the token is still fresh", async () => {
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    await ensureFreshAccessToken(profileName);
    expect(storedAccessToken()).toBe("acc"); // unchanged — no refresh
  });

  test("no-op when ALTERTABLE_API_KEY is set (env key short-circuits refresh)", async () => {
    // Expired OAuth session, but no /oauth/token mock — a refresh attempt would throw.
    secretSet("oauth/refresh-token", "ref", profileName);
    configSet("oauth_expiry", String(Date.now() - 1000), profileName);
    const tokenBefore = storedAccessToken();

    process.env.ALTERTABLE_API_KEY = "atm_env";
    await ensureFreshAccessToken(profileName);
    expect(storedAccessToken()).toBe(tokenBefore); // tokens must not be cleared
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
    secretSet("oauth/refresh-token", "ref", profileName);
    configSet("oauth_expiry", String(Date.now() - 1000), profileName);

    await ensureFreshAccessToken(profileName);
    expect(storedAccessToken()).toBe("acc2");
    expect(Number.parseInt(configGet("oauth_expiry", profileName), 10)).toBeGreaterThan(Date.now());
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
    secretSet("oauth/access-token", "acc", profileName);
    secretSet("oauth/refresh-token", "ref", profileName);
    configSet("oauth_expiry", String(Date.now() - 1000), profileName);

    let caught: unknown;
    try {
      await ensureFreshAccessToken(profileName);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigurationError);
    expect(storedAccessToken()).toBe("");
  });

  test("keeps tokens and rethrows when refresh returns 404 (wrong URL, not a dead session)", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/oauth/token",
          method: "POST",
          status: 404,
          body: "not found",
        },
      ]),
    );
    secretSet("oauth/access-token", "acc", profileName);
    secretSet("oauth/refresh-token", "ref", profileName);
    configSet("oauth_expiry", String(Date.now() - 1000), profileName);

    let caught: unknown;
    try {
      await ensureFreshAccessToken(profileName);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpError);
    expect(storedAccessToken()).toBe("acc"); // session preserved
    expect(secretGet("oauth/refresh-token", profileName)).toBe("ref");
  });

  test("keeps tokens and rethrows when the refresh fails with a network error", async () => {
    // Bypass the mock harness so the refresh hits a real closed port.
    delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "http://127.0.0.1:1";
    secretSet("oauth/access-token", "acc", profileName);
    secretSet("oauth/refresh-token", "ref", profileName);
    configSet("oauth_expiry", String(Date.now() - 1000), profileName);

    let caught: unknown;
    try {
      await ensureFreshAccessToken(profileName);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NetworkError);
    expect(storedAccessToken()).toBe("acc");
    expect(secretGet("oauth/refresh-token", profileName)).toBe("ref");
  });
});

describe("management request auth resolution", () => {
  test("refreshes an expired OAuth token before sending", async () => {
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
    secretSet("oauth/access-token", "stale", profileName);
    secretSet("oauth/refresh-token", "ref", profileName);
    configSet("oauth_expiry", String(Date.now() - 1000), profileName);

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    await runWithCliRuntime(runtime, async () => {
      refreshCliRuntimeContext(getCliContext());
      await sendHttp(
        { plane: "management", method: "GET", endpoint: "/whoami" },
        createExecutionContext(runtime),
      );
    });

    expect(storedAccessToken()).toBe("acc3");
    expect(Number.parseInt(configGet("oauth_expiry", profileName), 10)).toBeGreaterThan(Date.now());
  });

  test("does not refresh an expired OAuth token when auth recovery is disabled", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          authPattern: "stale",
          body: '{"principal":{},"organization":{}}',
        },
      ]),
    );
    secretSet("oauth/access-token", "stale", profileName);
    secretSet("oauth/refresh-token", "ref", profileName);
    const expiredAt = String(Date.now() - 1000);
    configSet("oauth_expiry", expiredAt, profileName);

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    await runWithCliRuntime(runtime, async () => {
      refreshCliRuntimeContext(getCliContext());
      await sendHttp(
        {
          plane: "management",
          method: "GET",
          endpoint: "/whoami",
          authRecovery: false,
        },
        createExecutionContext(runtime),
      );
    });

    expect(storedAccessToken()).toBe("stale");
    expect(configGet("oauth_expiry", profileName)).toBe(expiredAt);
  });

  test("resolves the header live from the store, not a bootstrap cache", async () => {
    storeOAuthTokens({ access_token: "tok_a", refresh_token: "r", expires_in: 3600 }, profileName);

    writeFileSync(
      mockFile,
      JSON.stringify([
        { urlPattern: "/whoami", method: "GET", body: '{"principal":{},"organization":{}}' },
      ]),
    );

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    await runWithCliRuntime(runtime, async () => {
      refreshCliRuntimeContext(getCliContext());
      // Simulate an out-of-band token rotation (e.g. a prior refresh in this process).
      secretSet("oauth/access-token", "tok_b", profileName);
      await sendHttp(
        { plane: "management", method: "GET", endpoint: "/whoami" },
        createExecutionContext(runtime),
      );
    });

    // The header reflects the rotated token, resolved live at send time.
    expect(getManagementAuthHeader(profileName)).toBe("Authorization: Bearer tok_b");
  });
});
