import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveOAuthBase } from "@/lib/config.ts";
import { configGet } from "@/lib/config.ts";
import { setCliContext } from "@/context.ts";
import { parseCallback, buildAuthorizeUrl, startLoopbackServer } from "@/lib/oauth-flow.ts";
import { storeOAuthTokens, getStoredAccessToken, clearOAuthTokens } from "@/lib/oauth-profile.ts";
import { getActiveProfileName, profileExists, setActiveProfile } from "@/lib/profile-store.ts";
import { createEmptyProfile } from "@/features/profile/model.ts";
import { secretSet } from "@/lib/secrets.ts";

const profileName = "default";
let testHome = "";
const TEST_PRINCIPAL = {
  type: "User",
  name: "Test User",
  email: "test.user@altertable.test",
} as const;

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
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
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
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    expect(getStoredAccessToken(profileName)).toBe("acc");
    const expiry = Number.parseInt(configGet("oauth_expiry", profileName), 10);
    expect(expiry).toBeGreaterThanOrEqual(before + 3600 * 1000);
  });

  test("clear removes tokens and expiry", () => {
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    clearOAuthTokens(profileName);
    expect(getStoredAccessToken(profileName)).toBe("");
    expect(configGet("oauth_expiry", profileName)).toBe("");
  });
});

import {
  assertInteractiveLogin,
  resolveWhoamiEnvironmentSlug,
  applyControlPlaneOverride,
  sameWhoamiContext,
  storeLoginProfileMetadata,
} from "@/commands/login.ts";
import {
  assertProfileHasNoEnvCredentials,
  resolveActiveProfileName,
} from "@/features/profile/model.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { configureRunClear } from "@/lib/profile-configure-core.ts";
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

describe("sameWhoamiContext", () => {
  const WHOAMI = {
    principal: { type: "User", name: "Sylvain", email: "sylvain@altertable.ai", slug: "sylvain" },
    organization: { name: "Altertable", slug: "altertable" },
    authentication_scope: "environment",
    environment_slug: "production",
  } as const;

  test("true for the same identity and context", () => {
    // A cosmetic display-name change is not an identity change.
    expect(
      sameWhoamiContext(WHOAMI, { ...WHOAMI, principal: { ...WHOAMI.principal, name: "S." } }),
    ).toBe(true);
  });

  test("false when the principal changes", () => {
    expect(
      sameWhoamiContext(WHOAMI, {
        ...WHOAMI,
        principal: { ...WHOAMI.principal, slug: "mallory", email: "mallory@altertable.ai" },
      }),
    ).toBe(false);
  });

  test("false when the organization changes", () => {
    expect(sameWhoamiContext(WHOAMI, { ...WHOAMI, organization: { slug: "other" } })).toBe(false);
  });

  test("false when the environment changes", () => {
    expect(sameWhoamiContext(WHOAMI, { ...WHOAMI, environment_slug: "staging" })).toBe(false);
  });
});

describe("login profile metadata", () => {
  const WHOAMI = {
    principal: TEST_PRINCIPAL,
    organization: { name: "Altertable", slug: "altertable" },
    authentication_scope: "environment",
    environment_slug: "production",
  } as const;

  // `altertable login` on a fresh install signs into the unauthenticated `default`
  // profile and stores the whoami identity there, rather than deriving a new one.
  test("lands in the current default profile when it is unauthenticated", () => {
    const metadata = storeLoginProfileMetadata(WHOAMI, {});
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);

    expect(metadata).toEqual({
      environment: "production",
      profileName: "default",
      profileAction: "unchanged",
    });
    expect(getActiveProfileName()).toBe("default");
    expect(profileExists("altertable_production")).toBe(false);
    expect(configGet("api_key_env", profileName)).toBe("production");
    expect(configGet("organization_slug", profileName)).toBe("altertable");
    expect(configGet("organization_name", profileName)).toBe("Altertable");
    expect(configGet("principal_name", profileName)).toBe("Test User");
    expect(configGet("principal_email", profileName)).toBe("test.user@altertable.test");
    expect(getStoredAccessToken(profileName)).toBe("acc");
  });

  // A second `altertable login` must not clobber the now-authenticated `default`;
  // it derives and switches to a fresh profile instead.
  test("creates a separate profile when the current one is already authenticated", () => {
    storeLoginProfileMetadata(WHOAMI, {});
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);

    const metadata = storeLoginProfileMetadata(WHOAMI, {});

    expect(metadata).toEqual({
      environment: "production",
      profileName: "altertable_production",
      profileAction: "created",
    });
    expect(profileExists("default")).toBe(true);
    expect(profileExists("altertable_production")).toBe(true);
    expect(getActiveProfileName()).toBe("altertable_production");
  });

  // `altertable profile create new` (which switches to `new`) followed by
  // `altertable login` signs into `new`, since it has not been configured yet.
  test("lands in a freshly created, unconfigured profile", () => {
    createEmptyProfile("new");
    setActiveProfile("new");

    const metadata = storeLoginProfileMetadata(WHOAMI, {});

    expect(metadata).toEqual({
      environment: "production",
      profileName: "new",
      profileAction: "unchanged",
    });
    expect(getActiveProfileName()).toBe("new");
    expect(profileExists("altertable_production")).toBe(false);
  });

  // Lakehouse-only credentials still count as "authenticated" — a login must not
  // overwrite them, so it branches to a new profile.
  test("treats a profile with only lakehouse credentials as authenticated", () => {
    secretSet("lakehouse/password", "s_lake", profileName);

    const metadata = storeLoginProfileMetadata(WHOAMI, {});

    expect(metadata).toEqual({
      environment: "production",
      profileName: "altertable_production",
      profileAction: "created",
    });
    expect(getActiveProfileName()).toBe("altertable_production");
  });

  // Credentials supplied via environment variables aren't a stored profile; the
  // active identity is the reserved `_from_env` pseudo-profile.
  test("resolves the active identity to reserved _from_env when a credential env var is set", () => {
    expect(resolveActiveProfileName()).toBe("default");

    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(resolveActiveProfileName()).toBe("_from_env");
    delete process.env.ALTERTABLE_API_KEY;

    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "dG9rZW4=";
    expect(resolveActiveProfileName()).toBe("_from_env");
    delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;

    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "u";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "p";
    expect(resolveActiveProfileName()).toBe("_from_env");
  });

  // Environment credentials pin the identity, so stored-profile controls (login,
  // switching) are locked while they are set.
  test("locks stored-profile controls while credentials come from the environment", () => {
    expect(() => assertProfileHasNoEnvCredentials("altertable login")).not.toThrow();

    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(() => assertProfileHasNoEnvCredentials("altertable login")).toThrow(ConfigurationError);
  });

  test("_from_env is a reserved profile name that cannot be created", () => {
    expect(() => createEmptyProfile("_from_env")).toThrow();
  });

  test("can replace the current profile login session", () => {
    const metadata = storeLoginProfileMetadata(
      {
        principal: TEST_PRINCIPAL,
        organization: { name: "Altertable", slug: "altertable" },
        authentication_scope: "environment",
        environment_slug: "production",
      },
      { "replace-profile": true },
    );

    expect(metadata).toEqual({
      environment: "production",
      profileName: "default",
      profileAction: "replaced",
    });
    expect(profileExists("default")).toBe(true);
    expect(profileExists("altertable_production")).toBe(false);
    expect(getActiveProfileName()).toBe("default");
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    expect(getStoredAccessToken(profileName)).toBe("acc");
  });

  test("stores endpoint overrides after successful login metadata is available", () => {
    storeLoginProfileMetadata(
      {
        principal: {},
        organization: { name: "Altertable", slug: "altertable" },
        environment_slug: "production",
      },
      {
        "control-plane-url": "https://app.altertable.test",
        "data-plane-url": "https://api.altertable.test",
      },
    );

    expect(configGet("management_api_base", profileName)).toBe("https://app.altertable.test");
    expect(configGet("api_base", profileName)).toBe("https://api.altertable.test");
  });
});

describe("login --control-plane-url", () => {
  test("stores the control-plane root so OAuth targets it", () => {
    applyControlPlaneOverride({ "control-plane-url": "https://app.altertable.test" });
    expect(resolveOAuthBase(profileName)).toBe("https://app.altertable.test/oauth");
  });

  test("no-op without the flag (keeps the default)", () => {
    applyControlPlaneOverride({});
    expect(resolveOAuthBase(profileName)).toBe("https://app.altertable.ai/oauth");
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
    expect(resolveOAuthBase(profileName)).toBe("http://app.altertable.test/oauth");
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
    storeOAuthTokens({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }, profileName);
    expect(getStoredAccessToken(profileName)).toBe("acc");
    configureRunClear(getOutputSink());
    expect(getStoredAccessToken(profileName)).toBe("");
  });
});
