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
import { secretSet } from "@/lib/secrets.ts";

let testHome = "";
const profileName = "default";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-auth-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
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
    expect(() => getLakehouseAuthHeader(profileName)).toThrow(ConfigurationError);
    expect(() => getLakehouseAuthHeader(profileName)).toThrow(
      "No credentials. Run 'altertable login', 'altertable profile configure', or set ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD (or ALTERTABLE_BASIC_AUTH_TOKEN).",
    );
  });

  test("getManagementAuthHeader throws ConfigurationError when API key is missing", () => {
    expect(() => getManagementAuthHeader(profileName)).toThrow(ConfigurationError);
    expect(() => getManagementAuthHeader(profileName)).toThrow(
      "No management credentials. Run 'altertable login', 'altertable profile configure --api-key atm_xxx --env <name>', or set ALTERTABLE_API_KEY.",
    );
  });

  test("requireManagementEnv throws ConfigurationError when environment is missing", () => {
    expect(() => requireManagementEnv(profileName)).toThrow(ConfigurationError);
    expect(() => requireManagementEnv(profileName)).toThrow(
      "No environment set. Run 'altertable profile configure --api-key atm_xxx --env <name>' or set ALTERTABLE_ENV.",
    );
  });

  test("resolves lakehouse and management credentials independently", () => {
    configSet("user", "alice", profileName);
    secretSet("lakehouse/password", "lakehouse-secret", profileName);
    secretSet("api-key", "atm_test", profileName);

    const lakehouseToken = Buffer.from("alice:lakehouse-secret").toString("base64");
    expect(getLakehouseAuthHeader(profileName)).toBe(`Authorization: Basic ${lakehouseToken}`);
    expect(getManagementAuthHeader(profileName)).toBe("Authorization: Bearer atm_test");
  });

  test("resolves lakehouse username/password from environment variables", () => {
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";

    const lakehouseToken = Buffer.from("env-user:env-pass").toString("base64");
    expect(getLakehouseAuthHeader(profileName)).toBe(`Authorization: Basic ${lakehouseToken}`);
  });

  test("prefers environment lakehouse credentials over stored credentials", () => {
    configSet("user", "alice", profileName);
    secretSet("lakehouse/password", "lakehouse-secret", profileName);
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";

    const lakehouseToken = Buffer.from("env-user:env-pass").toString("base64");
    expect(getLakehouseAuthHeader(profileName)).toBe(`Authorization: Basic ${lakehouseToken}`);
  });

  test("prefers environment Basic token over username/password credentials", () => {
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "env-basic-token";
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    configSet("user", "alice", profileName);
    secretSet("lakehouse/password", "lakehouse-secret", profileName);

    expect(getLakehouseAuthHeader(profileName)).toBe("Authorization: Basic env-basic-token");
  });
});
