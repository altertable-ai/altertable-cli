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
import { configGet, configSet, resolveManagementApiBase, resolveOAuthBase } from "@/lib/config.ts";
import { secretGet, secretSet } from "@/lib/secrets.ts";
import { setCliContext, getCliContext } from "@/context.ts";
import { ConfigurationError, HttpError, NetworkError } from "@/lib/errors.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { createCliRuntime, refreshCliRuntimeContext, runWithCliRuntime } from "@/lib/runtime.ts";
import { fetchLoginWhoami, storeLoginProfileMetadata } from "@/commands/login.ts";

const profileName = "default";
let testHome = "";
let mockFile = "";

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
    expect(getStoredAccessToken(profileName)).toBe(""); // nothing stored, nothing refreshed
  });

  test("no-op when the token is still fresh", async () => {
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    await ensureFreshAccessToken(profileName);
    expect(getStoredAccessToken(profileName)).toBe("acc"); // unchanged — no refresh
  });

  test("no-op when ALTERTABLE_API_KEY is set (env key short-circuits refresh)", async () => {
    // Expired OAuth session, but no /oauth/token mock — a refresh attempt would throw.
    secretSet("oauth/refresh-token", "ref", profileName);
    configSet("oauth_expiry", String(Date.now() - 1000), profileName);
    const tokenBefore = getStoredAccessToken(profileName);

    process.env.ALTERTABLE_API_KEY = "atm_env";
    await ensureFreshAccessToken(profileName);
    expect(getStoredAccessToken(profileName)).toBe(tokenBefore); // tokens must not be cleared
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
    expect(getStoredAccessToken(profileName)).toBe("acc2");
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
    expect(getStoredAccessToken(profileName)).toBe("");
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
    expect(getStoredAccessToken(profileName)).toBe("acc"); // session preserved
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
    expect(getStoredAccessToken(profileName)).toBe("acc");
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
      await managementRequest("GET", "/whoami");
    });

    expect(getStoredAccessToken(profileName)).toBe("acc3");
    expect(Number.parseInt(configGet("oauth_expiry", profileName), 10)).toBeGreaterThan(Date.now());
  });

  // Regression: logging into org B while org A's session lives in `default`.
  // whoami during login must use the freshly minted org B token — not org A's
  // stored session — otherwise it identifies org A and the login wrongly derives
  // an `org-a_*` profile instead of branching to org B.
  test("whoami during login honors the freshly minted token, not the stored session", async () => {
    // "Org A login" already landed in the default profile.
    storeOAuthTokens(
      { access_token: "org_a_token", refresh_token: "ref_a", expires_in: 3600 },
      profileName,
    );
    configSet("organization_slug", "org-a", profileName);

    // The management server identifies the caller from its bearer token.
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          authPattern: "org_a_token",
          body: '{"principal":{},"organization":{"slug":"org-a","name":"Org A"},"environment_slug":"production"}',
        },
        {
          urlPattern: "/whoami",
          method: "GET",
          authPattern: "org_b_token",
          body: '{"principal":{},"organization":{"slug":"org-b","name":"Org B"},"environment_slug":"production"}',
        },
      ]),
    );

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const metadata = await runWithCliRuntime(runtime, async () => {
      refreshCliRuntimeContext(getCliContext());
      // The org B browser flow just minted this token.
      const whoami = await fetchLoginWhoami(
        { access_token: "org_b_token", refresh_token: "ref_b", expires_in: 3600 },
        resolveManagementApiBase(profileName),
      );
      return storeLoginProfileMetadata(whoami, {});
    });

    // Logging into org B must branch to org B's profile, not org A's.
    expect(metadata.profileName).toBe("org-b_production");
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
      await managementRequest("GET", "/whoami");
    });

    // The header reflects the rotated token, resolved live at send time.
    expect(getManagementAuthHeader(profileName)).toBe("Authorization: Bearer tok_b");
  });
});
