import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configGet } from "@/lib/config.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { configureRunClear, configureRunSet } from "@/lib/profile-configure-core.ts";
import { profileExists } from "@/lib/profile-store.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { secretGet, secretSet } from "@/lib/secrets.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

let testHome = "";

async function captureErrorMessage(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected operation to fail");
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-configure-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe("configureRunSet", () => {
  test("accumulates management and lakehouse credentials across invocations", async () => {
    await configureRunSet({ apiKey: "atm_test", env: "development" });
    await configureRunSet({ user: "alice", password: "lakehouse-secret" });

    expect(secretGet("api-key", "default")).toBe("atm_test");
    expect(configGet("api_key_env", "default")).toBe("development");
    expect(secretGet("lakehouse/password", "default")).toBe("lakehouse-secret");
    expect(configGet("user", "default")).toBe("alice");
  });

  test("writes configuration and credentials to a named profile", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });

    expect(profileExists("staging")).toBe(true);
    expect(configGet("api_key_env", "staging")).toBe("staging");
    expect(secretGet("api-key", "staging")).toBe("atm_staging");
  });

  test("rejects mixed authentication mechanisms with actionable messages", async () => {
    const mixedPlanes = await captureErrorMessage(() =>
      configureRunSet({ user: "u", password: "p", apiKey: "atm_x", env: "prod" }),
    );
    const mixedLakehouseCredentials = await captureErrorMessage(() =>
      configureRunSet({ user: "u", password: "p", basicToken: "dG9rZW4=" }),
    );

    expect(mixedPlanes).toContain("single authentication mechanism per configure invocation");
    expect(mixedLakehouseCredentials).toContain("single lakehouse authentication mechanism");
  });

  test("warns when a password is passed on argv", async () => {
    const metadata: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeMetadata = (lines) => metadata.push(...lines);

    await runWithCliRuntime(runtime, () =>
      configureRunSet({ user: "alice", password: "test-password-value" }),
    );

    expect(metadata.some((line) => line.includes("--password-stdin"))).toBe(true);
  });
});

describe("configureRunClear", () => {
  test("removes root files, profile directories, and profile secrets", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });
    await configureRunSet({ profile: "prod", apiKey: "atm_prod", env: "prod" });
    secretSet("lakehouse/password", "lake-secret", "staging");

    configureRunClear();

    expect(existsSync(join(testHome, "config"))).toBe(false);
    expect(existsSync(join(testHome, "credentials"))).toBe(false);
    expect(existsSync(join(testHome, "profiles"))).toBe(false);
    expect(secretGet("api-key", "staging")).toBe("");
    expect(secretGet("api-key", "prod")).toBe("");
    expect(secretGet("lakehouse/password", "staging")).toBe("");
  });

  test("reports failures while removing configuration", () => {
    mkdirSync(join(testHome, "config"));

    expect(() => configureRunClear()).toThrow(ConfigurationError);
  });
});
