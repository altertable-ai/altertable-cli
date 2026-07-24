import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configSet } from "@/lib/config.ts";
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
