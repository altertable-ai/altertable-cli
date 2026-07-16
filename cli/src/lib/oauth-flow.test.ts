import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configGet, resolveOAuthBase } from "@/lib/config.ts";
import { setCliContext } from "@/context.ts";
import { buildAuthorizeUrl, parseCallback, startLoopbackServer } from "@/lib/oauth-flow.ts";
import { clearOAuthTokens, storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { secretGet } from "@/lib/secrets.ts";

const profileName = "default";
let testHome = "";

function storedAccessToken(): string {
  return secretGet("oauth/access-token", profileName);
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-oauth-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
});

describe("resolveOAuthBase", () => {
  test("defaults to the public app root + /oauth", () => {
    expect(resolveOAuthBase(profileName)).toBe("https://app.altertable.ai/oauth");
  });

  test("respects ALTERTABLE_MANAGEMENT_API_BASE", () => {
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
    expect(resolveOAuthBase(profileName)).toBe("https://app.example.com/oauth");
  });
});

describe("parseCallback", () => {
  test("returns the code on success", () => {
    expect(parseCallback("/callback?code=abc&state=st", "st")).toEqual({ ok: true, code: "abc" });
  });

  test("rejects a state mismatch", () => {
    expect(parseCallback("/callback?code=abc&state=other", "st").ok).toBe(false);
  });

  test("surfaces provider errors", () => {
    expect(parseCallback("/callback?error=access_denied&error_description=nope", "st")).toEqual({
      ok: false,
      message: "Authorization failed: access_denied — nope",
    });
  });

  test("rejects a missing code", () => {
    expect(parseCallback("/callback?state=st", "st").ok).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  test("includes PKCE, state, scope, and client id", () => {
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
    const url = new URL(
      buildAuthorizeUrl(
        {
          redirectUri: "http://127.0.0.1:5000/callback",
          challenge: "chal",
          state: "st",
        },
        resolveOAuthBase(profileName),
      ),
    );
    expect(url.origin + url.pathname).toBe("https://app.example.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("client_id")).toBe("altertable_cli");
    expect(url.searchParams.get("scope")).toBe("management");
  });
});

describe("loopback server", () => {
  test("resolves the code from a valid callback", async () => {
    const server = await startLoopbackServer("st");
    try {
      const response = await fetch(`${server.redirectUri}?code=abc&state=st`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(await server.waitForCode()).toBe("abc");
    } finally {
      server.close();
    }
  });

  test("serves callback errors as plain text", async () => {
    const server = await startLoopbackServer("st");
    const settled = server.waitForCode().then(
      () => "resolved",
      () => "rejected",
    );
    try {
      const response = await fetch(
        `${server.redirectUri}?error=access_denied&error_description=${encodeURIComponent("<script>x</script>")}`,
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(await response.text()).toBe(
        "Authorization failed: access_denied — <script>x</script>",
      );
      expect(await settled).toBe("rejected");
    } finally {
      server.close();
    }
  });

  test("ignores non-callback paths", async () => {
    const server = await startLoopbackServer("st");
    try {
      const port = new URL(server.redirectUri).port;
      expect((await fetch(`http://127.0.0.1:${port}/favicon.ico`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe("token storage", () => {
  test("round-trips tokens and stamps expiry", () => {
    const before = Date.now();
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    expect(storedAccessToken()).toBe("acc");
    expect(Number.parseInt(configGet("oauth_expiry", profileName), 10)).toBeGreaterThanOrEqual(
      before + 3600 * 1000,
    );
  });

  test("clear removes tokens and expiry", () => {
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    clearOAuthTokens(profileName);
    expect(storedAccessToken()).toBe("");
    expect(configGet("oauth_expiry", profileName)).toBe("");
  });
});
