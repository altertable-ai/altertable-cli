import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configGet } from "@/lib/config.ts";
import { getStoredAccessToken, storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { getActiveProfileName, profileExists } from "@/lib/profile-store.ts";
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

async function completeBrowserLogin(
  rawArgs: string[] = ["login"],
  whoami: object = DEFAULT_WHOAMI,
  accessToken = "access_token",
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
    ]),
  );

  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  const cli = createCliTestHarness();
  const completion = cli.run(rawArgs);

  let authorizeUrl: URL | undefined;
  for (let attempt = 0; attempt < 100 && !authorizeUrl; attempt += 1) {
    const match = cli.stderr.join("\n").match(/https?:\/\/[^\s]+\/oauth\/authorize\?[^\s]+/);
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
    expect(getStoredAccessToken("default")).toBe("access_token");
    expect(cli.stderr.join("\n")).toContain('using profile "default"');
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

    expect(getStoredAccessToken("default")).toBe("org_a_token");
    expect(getActiveProfileName()).toBe("org-b_production");
    expect(getStoredAccessToken("org-b_production")).toBe("org_b_token");
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
