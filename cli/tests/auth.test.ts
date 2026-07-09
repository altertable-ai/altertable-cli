import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getLakehouseAuthHeader,
  getManagementAuthHeader,
  requireManagementEnv,
} from "@/lib/auth.ts";
import { configSet } from "@/lib/config.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { resetSecretWarningsForTests, secretSet } from "@/lib/secrets.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-auth-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  resetSecretWarningsForTests();
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
  delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
});

describe("auth", () => {
  test("getLakehouseAuthHeader throws ConfigurationError when credentials are missing", () => {
    expect(() => getLakehouseAuthHeader()).toThrow(ConfigurationError);
    expect(() => getLakehouseAuthHeader()).toThrow(
      "No credentials. Run 'altertable profile --configure' or set ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD (or ALTERTABLE_BASIC_AUTH_TOKEN).",
    );
  });

  test("getManagementAuthHeader throws ConfigurationError when API key is missing", () => {
    expect(() => getManagementAuthHeader()).toThrow(ConfigurationError);
    expect(() => getManagementAuthHeader()).toThrow(
      "No management credentials. Run 'altertable login', 'altertable profile --configure --api-key atm_xxx --env <name>', or set ALTERTABLE_API_KEY.",
    );
  });

  test("requireManagementEnv throws ConfigurationError when environment is missing", () => {
    expect(() => requireManagementEnv()).toThrow(ConfigurationError);
    expect(() => requireManagementEnv()).toThrow(
      "No environment set. Run 'altertable profile --configure --api-key atm_xxx --env <name>' or set ALTERTABLE_ENV.",
    );
  });

  test("resolves lakehouse and management credentials independently", () => {
    configSet("user", "alice");
    secretSet("lakehouse/password", "lakehouse-secret");
    secretSet("api-key", "atm_test");

    const lakehouseToken = Buffer.from("alice:lakehouse-secret").toString("base64");
    expect(getLakehouseAuthHeader()).toBe(`Authorization: Basic ${lakehouseToken}`);
    expect(getManagementAuthHeader()).toBe("Authorization: Bearer atm_test");
  });

  test("resolves lakehouse username/password from environment variables", () => {
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";

    const lakehouseToken = Buffer.from("env-user:env-pass").toString("base64");
    expect(getLakehouseAuthHeader()).toBe(`Authorization: Basic ${lakehouseToken}`);
  });

  test("prefers environment lakehouse credentials over stored credentials", () => {
    configSet("user", "alice");
    secretSet("lakehouse/password", "lakehouse-secret");
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";

    const lakehouseToken = Buffer.from("env-user:env-pass").toString("base64");
    expect(getLakehouseAuthHeader()).toBe(`Authorization: Basic ${lakehouseToken}`);
  });

  test("prefers environment Basic token over username/password credentials", () => {
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "env-basic-token";
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    configSet("user", "alice");
    secretSet("lakehouse/password", "lakehouse-secret");

    expect(getLakehouseAuthHeader()).toBe("Authorization: Basic env-basic-token");
  });
});
