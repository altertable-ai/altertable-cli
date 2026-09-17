import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configGet, configSet } from "@/lib/config.ts";
import { getActiveProfileName, listProfileNames, setActiveProfile } from "@/lib/profile-store.ts";
import { secretGet, secretSet } from "@/lib/secrets.ts";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-logout-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
});

describe("logout command", () => {
  test("clears stored configuration for all profiles", async () => {
    configSet("api_key_env", "production", "default");
    secretSet("api-key", "atm_stored", "default");

    await runCommandWithTestRuntime(["logout"]);

    expect(secretGet("api-key", "default")).toBe("");
    expect(existsSync(join(testHome, "profiles"))).toBe(false);
  });

  test("--except-current keeps the active profile and removes the others", async () => {
    configSet("api_key_env", "production", "keeper");
    secretSet("api-key", "atm_keeper", "keeper");
    configSet("api_key_env", "staging", "other");
    secretSet("api-key", "atm_other", "other");
    setActiveProfile("keeper");

    await runCommandWithTestRuntime(["logout", "--except-current"]);

    expect(getActiveProfileName()).toBe("keeper");
    expect(listProfileNames()).toEqual(["keeper"]);
    expect(secretGet("api-key", "keeper")).toBe("atm_keeper");
    expect(configGet("api_key_env", "keeper")).toBe("production");
    expect(secretGet("api-key", "other")).toBe("");
  });

  // secretGet returns "" for any unknown profile, so assert on the store itself:
  // a logout that only unlinked directories would still pass the check above.
  test("--except-current erases the removed profiles' secrets from the store", async () => {
    secretSet("api-key", "atm_keeper", "keeper");
    secretSet("api-key", "atm_other", "other");
    secretSet("oauth/access-token", "oauth_other", "other");
    setActiveProfile("keeper");
    expect(readFileSync(join(testHome, "credentials"), "utf8")).toContain("atm_other");

    await runCommandWithTestRuntime(["logout", "--except-current"]);

    const credentials = readFileSync(join(testHome, "credentials"), "utf8");
    expect(credentials).not.toContain("atm_other");
    expect(credentials).not.toContain("oauth_other");
    expect(credentials).toContain("atm_keeper");
  });

  test("--except-current keeps the profile selected with --profile", async () => {
    configSet("api_key_env", "production", "keeper");
    secretSet("api-key", "atm_keeper", "keeper");
    configSet("api_key_env", "staging", "other");
    secretSet("api-key", "atm_other", "other");
    setActiveProfile("other");

    await runCommandWithTestRuntime(["--profile", "keeper", "logout", "--except-current"]);

    expect(getActiveProfileName()).toBe("keeper");
    expect(listProfileNames()).toEqual(["keeper"]);
    expect(secretGet("api-key", "keeper")).toBe("atm_keeper");
  });

  test("--except-current succeeds when there is nothing else to clear", async () => {
    configSet("api_key_env", "production", "default");
    secretSet("api-key", "atm_stored", "default");

    await runCommandWithTestRuntime(["logout", "--except-current"]);

    expect(listProfileNames()).toEqual(["default"]);
    expect(secretGet("api-key", "default")).toBe("atm_stored");
  });

  test("refuses to run while environment configuration is active", async () => {
    configSet("api_key_env", "production", "default");
    secretSet("api-key", "atm_stored", "default");
    process.env.ALTERTABLE_API_KEY = "atm_env";

    expect(runCommandWithTestRuntime(["logout"])).rejects.toThrow(
      "Profile management commands aren't available when configuring through environment variables.",
    );
    expect(runCommandWithTestRuntime(["logout"])).rejects.toThrow("ALTERTABLE_API_KEY");

    delete process.env.ALTERTABLE_API_KEY;
    expect(secretGet("api-key", "default")).toBe("atm_stored");
    expect(existsSync(join(testHome, "profiles", "default"))).toBe(true);
  });

  test("refuses for lakehouse-only environment configuration", async () => {
    configSet("user", "alice", "default");
    secretSet("lakehouse/password", "s3cret", "default");
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "env-token";

    expect(runCommandWithTestRuntime(["logout"])).rejects.toThrow(
      "Profile management commands aren't available when configuring through environment variables.",
    );

    delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
    expect(secretGet("lakehouse/password", "default")).toBe("s3cret");
  });
});
