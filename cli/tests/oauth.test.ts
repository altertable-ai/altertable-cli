import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveOAuthBase } from "@/lib/config.ts";
import { configGet } from "@/lib/config.ts";
import { setCliContext } from "@/context.ts";
import { parseCallback, buildAuthorizeUrl, startLoopbackServer } from "@/lib/oauth-flow.ts";
import { storeOAuthTokens, getStoredAccessToken, clearOAuthTokens } from "@/lib/oauth-profile.ts";

let testHome = "";

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
  delete process.env.ALTERTABLE_ALLOW_INSECURE_HTTP;
});

describe("resolveOAuthBase", () => {
  test("defaults to the public app root + /oauth", () => {
    expect(resolveOAuthBase()).toBe("https://app.altertable.ai/oauth");
  });

  test("respects ALTERTABLE_MANAGEMENT_API_BASE", () => {
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
    expect(resolveOAuthBase()).toBe("https://app.example.com/oauth");
  });
});

describe("parseCallback", () => {
  test("returns the code on success", () => {
    expect(parseCallback("/callback?code=abc&state=st", "st")).toEqual({ ok: true, code: "abc" });
  });

  test("rejects a state mismatch", () => {
    const outcome = parseCallback("/callback?code=abc&state=other", "st");
    expect(outcome.ok).toBe(false);
  });

  test("surfaces provider errors", () => {
    const outcome = parseCallback("/callback?error=access_denied&error_description=nope", "st");
    expect(outcome).toEqual({ ok: false, message: "Authorization failed: access_denied — nope" });
  });

  test("rejects a missing code", () => {
    expect(parseCallback("/callback?state=st", "st").ok).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  test("includes PKCE, state and client id", () => {
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
    const url = new URL(
      buildAuthorizeUrl({
        redirectUri: "http://127.0.0.1:5000/callback",
        challenge: "chal",
        state: "st",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://app.example.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("client_id")).toBe("altertable_cli");
    expect(url.searchParams.get("scope")).toBe("management");
    delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  });
});

describe("loopback server", () => {
  test("resolves the code from a valid callback", async () => {
    const server = await startLoopbackServer("st");
    try {
      const res = await fetch(`${server.redirectUri}?code=abc&state=st`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(await server.waitForCode()).toBe("abc");
    } finally {
      server.close();
    }
  });

  test("serves the callback error as plain text (no HTML reflection)", async () => {
    const server = await startLoopbackServer("st");
    const settled = server.waitForCode().then(
      () => "resolved",
      () => "rejected",
    );
    try {
      const res = await fetch(
        `${server.redirectUri}?error=access_denied&error_description=${encodeURIComponent("<script>x</script>")}`,
      );
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("text/plain");
      // The message is shown verbatim, but as plain text it cannot execute.
      expect(await res.text()).toBe("Authorization failed: access_denied — <script>x</script>");
      expect(await settled).toBe("rejected");
    } finally {
      server.close();
    }
  });

  test("ignores non-callback paths (e.g. favicon)", async () => {
    const server = await startLoopbackServer("st");
    try {
      const port = new URL(server.redirectUri).port;
      const res = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe("token storage", () => {
  test("round-trips tokens and stamps expiry", () => {
    const before = Date.now();
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
    expect(getStoredAccessToken()).toBe("acc");
    const expiry = Number.parseInt(configGet("oauth_expiry"), 10);
    expect(expiry).toBeGreaterThanOrEqual(before + 3600 * 1000);
  });

  test("clear removes tokens and expiry", () => {
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
    clearOAuthTokens();
    expect(getStoredAccessToken()).toBe("");
    expect(configGet("oauth_expiry")).toBe("");
  });
});

import {
  assertInteractiveLogin,
  resolveWhoamiEnvironmentSlug,
  applyControlPlaneOverride,
  storeLoginProfileMetadata,
} from "@/commands/login.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { configureRunClear } from "@/lib/configure.ts";
import { getOutputSink } from "@/lib/runtime.ts";

describe("resolveWhoamiEnvironment", () => {
  test("reads the flat environment_slug field", () => {
    expect(
      resolveWhoamiEnvironmentSlug({
        principal: { type: "User", name: "Sylvain", email: "sylvain@altertable.ai" },
        organization: { name: "Altertable", slug: "altertable" },
        authentication_scope: "environment",
        environment_slug: "production",
      }),
    ).toBe("production");
  });

  test("returns undefined when no environment is scoped", () => {
    expect(resolveWhoamiEnvironmentSlug({ principal: {}, organization: {} })).toBeUndefined();
  });
});

describe("login profile metadata", () => {
  test("stores environment and organization from whoami", () => {
    const environment = storeLoginProfileMetadata(
      {
        principal: { type: "User", name: "François", email: "francois@altertable.ai" },
        organization: { name: "Altertable", slug: "altertable" },
        authentication_scope: "environment",
        environment_slug: "production",
      },
      {},
    );

    expect(environment).toBe("production");
    expect(configGet("api_key_env")).toBe("production");
    expect(configGet("organization_slug")).toBe("altertable");
    expect(configGet("organization_name")).toBe("Altertable");
  });

  test("stores the control-plane root after successful login metadata is available", () => {
    storeLoginProfileMetadata(
      {
        principal: {},
        organization: { name: "Altertable", slug: "altertable" },
        environment_slug: "production",
      },
      { "control-plane-url": "https://app.altertable.test" },
    );

    expect(configGet("management_api_base")).toBe("https://app.altertable.test");
  });
});

describe("login --control-plane-url", () => {
  test("stores the control-plane root so OAuth targets it", () => {
    applyControlPlaneOverride({ "control-plane-url": "https://app.altertable.test" });
    expect(resolveOAuthBase()).toBe("https://app.altertable.test/oauth");
  });

  test("no-op without the flag (keeps the default)", () => {
    applyControlPlaneOverride({});
    expect(resolveOAuthBase()).toBe("https://app.altertable.ai/oauth");
  });

  test("rejects non-localhost http without --allow-insecure-http", () => {
    expect(() =>
      applyControlPlaneOverride({ "control-plane-url": "http://app.altertable.test" }),
    ).toThrow();
  });

  test("allows non-localhost http with --allow-insecure-http", () => {
    applyControlPlaneOverride({
      "control-plane-url": "http://app.altertable.test",
      "allow-insecure-http": true,
    });
    expect(resolveOAuthBase()).toBe("http://app.altertable.test/oauth");
  });

  test("errors when ALTERTABLE_MANAGEMENT_API_BASE conflicts with the flag", () => {
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://other.test";
    expect(() =>
      applyControlPlaneOverride({ "control-plane-url": "https://app.altertable.test" }),
    ).toThrow(ConfigurationError);
    delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  });
});

describe("login interactivity guard", () => {
  test("refuses --json / --agent mode", () => {
    setCliContext({ debug: false, json: true, agent: false });
    expect(() => assertInteractiveLogin()).toThrow(ConfigurationError);
    setCliContext({ debug: false, json: false, agent: false });
  });

  test("refuses when stdin is not a TTY", () => {
    // bun:test runs with a non-TTY stdin, so the guard throws here too.
    setCliContext({ debug: false, json: false, agent: false });
    expect(() => assertInteractiveLogin()).toThrow(ConfigurationError);
  });
});

describe("clear removes OAuth credentials", () => {
  test("configureRunClear wipes stored OAuth tokens", () => {
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
    expect(getStoredAccessToken()).toBe("acc");
    configureRunClear(getOutputSink());
    expect(getStoredAccessToken()).toBe("");
  });
});
