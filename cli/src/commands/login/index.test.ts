import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configGet } from "@/lib/config.ts";
import { HttpError } from "@/lib/errors.ts";
import { storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { secretGet, secretSet } from "@/lib/secrets.ts";
import { getActiveProfileName, profileExists, setActiveProfile } from "@/lib/profile-store.ts";
import { createEmptyProfile, updateProfile } from "@/lib/profile/model.ts";
import { createCliTestHarness, runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import { delay } from "@/test-utils/time.ts";
import { forceNoTerminalColorForTests } from "@/test-utils/terminal.ts";

const DEFAULT_WHOAMI = {
  principal: {
    type: "User",
    name: "Test User",
    email: "test.user@altertable.test",
    slug: "test-user",
  },
  organization: { name: "Altertable", slug: "altertable" },
  authentication_scope: "environment",
  environment_slug: "production",
};

let testHome = "";
let mockFile = "";
let originalPath: string | undefined;
let stdinIsTty: PropertyDescriptor | undefined;

function storedAccessToken(profileName: string): string {
  return secretGet("oauth/access-token", profileName);
}

// bun-types declare rejects.toThrow() as void, so awaiting it trips the
// await-thenable lint rule; capture the rejection explicitly instead.
async function expectRejection(promise: Promise<unknown>, message: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(message);
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-login-test-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.OSC_HYPERLINK = "0";
  originalPath = process.env.PATH;
  stdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  forceNoTerminalColorForTests();

  for (const browserCommand of ["open", "xdg-open"]) {
    const browserPath = join(testHome, browserCommand);
    writeFileSync(browserPath, "#!/bin/sh\nexit 0\n");
    chmodSync(browserPath, 0o755);
  }
  process.env.PATH = `${testHome}:${originalPath ?? ""}`;
});

afterEach(() => {
  if (stdinIsTty) Object.defineProperty(process.stdin, "isTTY", stdinIsTty);
  rmSync(testHome, { recursive: true, force: true });
  process.env.PATH = originalPath;
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_ALLOW_INSECURE_HTTP;
  delete process.env.OSC_HYPERLINK;
});

const SERVICE_ACCOUNT_RESPONSE = {
  service_account: { id: "sa-1", label: "My Service", slug: "my-service" },
  role_assignments: [{ role: "catalog:reader", resource_kind: "catalog", resource_id: "cat-1" }],
  service_oauth_token: "svc_access_token",
};

const CATALOG_LIST_MOCKS = [
  {
    urlPattern: "/environments/production/databases",
    method: "GET",
    body: JSON.stringify({ databases: [{ id: "cat-1", name: "Analytics", slug: "analytics" }] }),
  },
  {
    urlPattern: "/environments/production/connections",
    method: "GET",
    body: JSON.stringify({ connections: [{ id: "cat-2", name: "Events", slug: "events" }] }),
  },
];

function httpLogJsonPayload(logPath: string, urlSubstring: string): unknown {
  const entry = readFileSync(logPath, "utf8")
    .split("---\n")
    .find((block) => block.includes(`URL=`) && block.includes(urlSubstring));
  if (!entry) {
    throw new Error(`No HTTP log entry for ${urlSubstring}`);
  }
  const payloadLine = entry.split("\n").find((line) => line.startsWith("PAYLOAD="));
  if (!payloadLine) {
    throw new Error(`No PAYLOAD= entry for ${urlSubstring}`);
  }
  return JSON.parse(payloadLine.slice("PAYLOAD=".length));
}

async function completeBrowserLogin(
  rawArgs: string[] = ["login"],
  whoami: object = DEFAULT_WHOAMI,
  accessToken = "access_token",
  extraMocks: object[] = [],
) {
  writeFileSync(
    mockFile,
    JSON.stringify([
      {
        urlPattern: "/oauth/token",
        method: "POST",
        body: JSON.stringify({
          access_token: accessToken,
          token_type: "Bearer",
          refresh_token: "refresh_token",
          expires_in: 3600,
        }),
      },
      {
        urlPattern: "/whoami",
        method: "GET",
        authPattern: accessToken,
        body: JSON.stringify(whoami),
      },
      ...extraMocks,
    ]),
  );

  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  const cli = createCliTestHarness();
  const completion = cli.run(rawArgs);

  let authorizeUrl: URL | undefined;
  for (let attempt = 0; attempt < 100 && !authorizeUrl; attempt += 1) {
    const match = cli.stdout.join("\n").match(/https?:\/\/[^\s]+\/oauth\/authorize\?[^\s]+/);
    if (match?.[0]) authorizeUrl = new URL(match[0]);
    if (!authorizeUrl) await delay(5);
  }
  if (!authorizeUrl) throw new Error("login command did not print an authorize URL");

  const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
  const state = authorizeUrl.searchParams.get("state");
  if (!redirectUri || !state) throw new Error("authorize URL is missing callback parameters");
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", "code");
  callback.searchParams.set("state", state);
  expect((await fetch(callback)).status).toBe(200);
  await completion;
  return cli;
}

describe("login command", () => {
  test("refuses non-interactive and JSON invocations before opening a browser", () => {
    return expect(
      runCommandWithTestRuntime(["login"], { debug: false, json: true, agent: false }),
    ).rejects.toThrow("needs an interactive terminal");
  });

  test("signs a fresh installation into the current default profile", async () => {
    const cli = await completeBrowserLogin();

    expect(getActiveProfileName()).toBe("default");
    expect(profileExists("altertable_production")).toBe(false);
    expect(configGet("api_key_env", "default")).toBe("production");
    expect(configGet("organization_slug", "default")).toBe("altertable");
    expect(configGet("principal_email", "default")).toBe("test.user@altertable.test");
    expect(storedAccessToken("default")).toBe("access_token");
    expect(cli.stdout.join("\n")).toContain('using profile "default"');
    expect(cli.stderr).toEqual([]);
  });

  test("passes requested organization and environment to browser authorization", async () => {
    const cli = await completeBrowserLogin(["login", "--org", "acme", "--env", "staging"]);
    const match = cli.stdout.join("\n").match(/https?:\/\/[^\s]+\/oauth\/authorize\?[^\s]+/);
    expect(match).not.toBeNull();
    const url = new URL(match![0]);
    expect(url.searchParams.get("organization")).toBe("acme");
    expect(url.searchParams.get("environment")).toBe("staging");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(storedAccessToken("default")).toBe("access_token");
  });

  test("rejects empty organization or environment slugs before starting OAuth", async () => {
    for (const flag of ["--org", "--env"]) {
      await expectRejection(
        runCommandWithTestRuntime(["login", flag, "   "]),
        `${flag} requires a non-empty slug`,
      );
    }
  });

  test("preserves an authenticated profile when signing into another organization", async () => {
    storeOAuthTokens(
      { access_token: "org_a_token", refresh_token: "org_a_refresh", expires_in: 3600 },
      "default",
    );

    await completeBrowserLogin(
      ["login"],
      {
        ...DEFAULT_WHOAMI,
        organization: { name: "Org B", slug: "org-b" },
      },
      "org_b_token",
    );

    expect(storedAccessToken("default")).toBe("org_a_token");
    expect(getActiveProfileName()).toBe("org-b_production");
    expect(storedAccessToken("org-b_production")).toBe("org_b_token");
  });

  test("signs into a fresh empty profile without deriving another profile", async () => {
    createEmptyProfile("new");
    setActiveProfile("new");

    await completeBrowserLogin();

    expect(getActiveProfileName()).toBe("new");
    expect(profileExists("altertable_production")).toBe(false);
    expect(storedAccessToken("new")).toBe("access_token");
  });

  test("preserves lakehouse-only authentication by creating a login profile", async () => {
    secretSet("lakehouse/password", "lakehouse-secret", "default");

    await completeBrowserLogin();

    expect(getActiveProfileName()).toBe("altertable_production");
    expect(secretGet("lakehouse/password", "default")).toBe("lakehouse-secret");
    expect(storedAccessToken("altertable_production")).toBe("access_token");
  });

  test("--replace-profile replaces the current login without creating a profile", async () => {
    storeOAuthTokens(
      { access_token: "old_token", refresh_token: "old_refresh", expires_in: 3600 },
      "default",
    );

    await completeBrowserLogin(
      ["login", "--replace-profile"],
      {
        ...DEFAULT_WHOAMI,
        organization: { name: "Org B", slug: "org-b" },
      },
      "replacement_token",
    );

    expect(getActiveProfileName()).toBe("default");
    expect(profileExists("org-b_production")).toBe(false);
    expect(configGet("organization_slug", "default")).toBe("org-b");
    expect(storedAccessToken("default")).toBe("replacement_token");
  });

  test("reused profiles inherit the control plane that authenticated the session", async () => {
    storeOAuthTokens(
      { access_token: "org_a_token", refresh_token: "org_a_refresh", expires_in: 3600 },
      "default",
    );
    updateProfile("default", { controlPlane: "https://login.altertable.test" });
    createEmptyProfile("org-b_production");
    updateProfile("org-b_production", { controlPlane: "https://stale.altertable.test" });

    await completeBrowserLogin(
      ["login"],
      {
        ...DEFAULT_WHOAMI,
        organization: { name: "Org B", slug: "org-b" },
      },
      "org_b_token",
    );

    expect(getActiveProfileName()).toBe("org-b_production");
    expect(configGet("management_api_base", "org-b_production")).toBe(
      "https://login.altertable.test",
    );
    expect(storedAccessToken("org-b_production")).toBe("org_b_token");
  });

  test("stores endpoint overrides only after a successful login", async () => {
    await completeBrowserLogin([
      "login",
      "--control-plane-url",
      "https://app.altertable.test",
      "--data-plane-url",
      "https://api.altertable.test",
    ]);

    expect(configGet("management_api_base", "default")).toBe("https://app.altertable.test");
    expect(configGet("api_base", "default")).toBe("https://api.altertable.test");
  });

  test("rejects insecure control-plane URLs before starting OAuth", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    return expect(
      runCommandWithTestRuntime(["login", "--control-plane-url", "http://app.altertable.test"]),
    ).rejects.toThrow();
  });
});

describe("login --service-account", () => {
  const serviceAccountProfile = "altertable_production_my-service";
  let logFile = "";

  beforeEach(() => {
    logFile = join(testHome, "http.log");
    process.env.ALTERTABLE_HTTP_LOG = logFile;
  });

  afterEach(() => {
    delete process.env.ALTERTABLE_HTTP_LOG;
  });

  function serviceAccountMock(
    body: object | string = SERVICE_ACCOUNT_RESPONSE,
    status = 201,
  ): object {
    return {
      urlPattern: "/environments/production/service_accounts",
      method: "POST",
      status,
      body: typeof body === "string" ? body : JSON.stringify(body),
    };
  }

  function serviceAccountMocks(body: object | string = SERVICE_ACCOUNT_RESPONSE): object[] {
    return [serviceAccountMock(body), ...CATALOG_LIST_MOCKS];
  }

  test("provisions a service account and stores its service OAuth token", async () => {
    const cli = await completeBrowserLogin(
      ["login", "--service-account", "My Service", "--scope", "catalog1:ro"],
      DEFAULT_WHOAMI,
      "access_token",
      serviceAccountMocks(),
    );

    expect(getActiveProfileName()).toBe(serviceAccountProfile);
    expect(profileExists(serviceAccountProfile)).toBe(true);
    expect(configGet("principal_type", serviceAccountProfile)).toBe("ServiceAccount");
    expect(configGet("principal_slug", serviceAccountProfile)).toBe("my-service");
    expect(storedAccessToken(serviceAccountProfile)).toBe("svc_access_token");
    expect(secretGet("oauth/refresh-token", serviceAccountProfile)).toBe("");
    expect(configGet("oauth_expiry", serviceAccountProfile)).toBe("");
    expect(secretGet("lakehouse/basic-token", serviceAccountProfile)).toBe("");
    expect(cli.stdout.join("\n")).toContain("My Service");
    expect(cli.stdout.join("\n")).toContain(serviceAccountProfile);
    expect(cli.stdout.join("\n")).toMatch(/CATALOG\s+SLUG\s+ACCESS/);
    expect(cli.stdout.join("\n")).toMatch(/Analytics\s+analytics\s+ro/);
    expect(cli.stderr).toEqual([]);

    const payload = httpLogJsonPayload(logFile, "/environments/production/service_accounts") as {
      label: string;
      caveats: Record<string, string>;
    };
    expect(payload.label).toBe("My Service");
    expect(payload.caveats).toEqual({ catalog1: "ro" });
    expect(payload).toHaveProperty("with_service_oauth_token");
  });

  test("leaves the signing-in user's own session unstored", async () => {
    await completeBrowserLogin(
      ["login", "--service-account", "My Service"],
      DEFAULT_WHOAMI,
      "access_token",
      serviceAccountMocks(),
    );

    expect(storedAccessToken("default")).toBe("");
    expect(secretGet("oauth/refresh-token", "default")).toBe("");
    expect(storedAccessToken(serviceAccountProfile)).toBe("svc_access_token");
  });

  test("reports the catalogs the server granted, not the ones --scope requested", async () => {
    const cli = await completeBrowserLogin(
      ["login", "--service-account", "My Service", "--scope", "analytics:rw"],
      DEFAULT_WHOAMI,
      "access_token",
      serviceAccountMocks({
        ...SERVICE_ACCOUNT_RESPONSE,
        role_assignments: [
          { role: "catalog:reader", resource_kind: "catalog", resource_id: "cat-1" },
          { role: "catalog:writer", resource_kind: "catalog", resource_id: "cat-2" },
        ],
      }),
    );

    const stdout = cli.stdout.join("\n");
    expect(stdout).toContain("Catalog access");
    expect(stdout).toMatch(/Analytics\s+analytics\s+ro/);
    expect(stdout).toMatch(/Events\s+events\s+rw/);
    expect(stdout).not.toContain("analytics:rw");
  });

  test("omits assignments that are not catalogs or cannot be resolved to a catalog", async () => {
    const cli = await completeBrowserLogin(
      ["login", "--service-account", "My Service"],
      DEFAULT_WHOAMI,
      "access_token",
      serviceAccountMocks({
        ...SERVICE_ACCOUNT_RESPONSE,
        role_assignments: [
          { role: "organization:member", resource_kind: "organization", resource_id: "org-1" },
          { role: "catalog:reader", resource_kind: "catalog", resource_id: "cat-unknown" },
        ],
      }),
    );

    const stdout = cli.stdout.join("\n");
    expect(stdout).not.toContain("Catalog access");
    expect(stdout).not.toContain("org-1");
    expect(stdout).not.toContain("cat-unknown");
  });

  test("warns when --scope was requested but the server reported no role assignments", async () => {
    const cli = await completeBrowserLogin(
      ["login", "--service-account", "My Service", "--scope", "analytics:ro"],
      DEFAULT_WHOAMI,
      "access_token",
      serviceAccountMocks({ ...SERVICE_ACCOUNT_RESPONSE, role_assignments: [] }),
    );

    const stdout = cli.stdout.join("\n");
    expect(stdout).not.toContain("Catalog access");
    expect(stdout).toContain("could not be confirmed");
  });

  test("fails when the response omits the service OAuth token", async () => {
    await expectRejection(
      completeBrowserLogin(
        ["login", "--service-account", "My Service"],
        DEFAULT_WHOAMI,
        "access_token",
        [serviceAccountMock({ ...SERVICE_ACCOUNT_RESPONSE, service_oauth_token: undefined })],
      ),
      "assertion failed retrieving service_account.service_oauth_token",
    );
  });

  test("omits the scope when --scope is not set", async () => {
    await completeBrowserLogin(
      ["login", "--service-account", "My Service"],
      DEFAULT_WHOAMI,
      "access_token",
      [serviceAccountMock()],
    );

    const payload = httpLogJsonPayload(logFile, "/environments/production/service_accounts") as {
      caveats?: unknown;
    };
    expect(payload).not.toHaveProperty("caveats");
  });

  test("--scope ro sends a blanket read-only scope", async () => {
    await completeBrowserLogin(
      ["login", "--service-account", "My Service", "--scope", "ro"],
      DEFAULT_WHOAMI,
      "access_token",
      serviceAccountMocks(),
    );

    const payload = httpLogJsonPayload(logFile, "/environments/production/service_accounts") as {
      caveats: unknown;
    };
    expect(payload.caveats).toBe("ro");
  });

  test("--scope without --service-account fails before any HTTP call", async () => {
    await expectRejection(
      runCommandWithTestRuntime(["login", "--scope", "catalog1:ro"]),
      "--scope requires --service-account",
    );
    expect(existsSync(logFile)).toBe(false);
  });

  test("--service-account with --replace-profile fails before any HTTP call", async () => {
    await expectRejection(
      runCommandWithTestRuntime(["login", "--service-account", "My Service", "--replace-profile"]),
      "--replace-profile",
    );
    expect(existsSync(logFile)).toBe(false);
  });

  test("an empty --service-account label fails before any HTTP call", async () => {
    await expectRejection(
      runCommandWithTestRuntime(["login", "--service-account", "   "]),
      "non-empty label",
    );
    expect(existsSync(logFile)).toBe(false);
  });

  test("malformed --scope fails before any HTTP call", async () => {
    await expectRejection(
      runCommandWithTestRuntime([
        "login",
        "--service-account",
        "My Service",
        "--scope",
        "catalog1:read",
      ]),
      "catalog1:read",
    );
    expect(existsSync(logFile)).toBe(false);
  });

  // A URL rejected late would leave a service account minted server-side whose
  // token was never stored, and the CLI switched to the empty profile.
  test("a rejected --data-plane-url fails before the browser flow and mints nothing", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    await expectRejection(
      runCommandWithTestRuntime([
        "login",
        "--service-account",
        "My Service",
        "--data-plane-url",
        "http://evil.example.com",
      ]),
      "Insecure HTTP URL",
    );

    expect(existsSync(logFile)).toBe(false);
    expect(profileExists(serviceAccountProfile)).toBe(false);
    expect(getActiveProfileName()).toBe("default");
  });

  test("surfaces a 403 from the service account endpoint", async () => {
    try {
      await completeBrowserLogin(
        ["login", "--service-account", "My Service", "--scope", "catalog1:ro"],
        DEFAULT_WHOAMI,
        "access_token",
        [
          serviceAccountMock(
            {
              error: { code: "forbidden", message: "Only org admins can create service accounts" },
            },
            403,
          ),
        ],
      );
      expect.unreachable("login --service-account should have failed");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.message).toContain("service account");
      expect(httpError.parsedDetail).toBe("Only org admins can create service accounts");
    }
  });

  test("names the missing service account endpoint on 404", async () => {
    try {
      await completeBrowserLogin(
        ["login", "--service-account", "My Service", "--scope", "catalog1:ro"],
        DEFAULT_WHOAMI,
        "access_token",
        [serviceAccountMock("<html>Not Found</html>", 404)],
      );
      expect.unreachable("login --service-account should have failed");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.message).toContain("service account");
      expect(httpError.message).toContain("Not found (404)");
      expect(httpError.details).toContain("/environments/production/service_accounts");
    }
  });
});
