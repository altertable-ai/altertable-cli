import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getLakehouseAuthHeader,
  getLakehouseCredentialPair,
  getManagementAuthHeader,
  requireManagementEnv,
} from "@/lib/auth.ts";
import { configSet } from "@/lib/config.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { FROM_ENV_PSEUDOPROFILE_NAME } from "@/lib/profile-store.ts";
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

  test("resolves environment credentials through the env pseudo-profile", () => {
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    process.env.ALTERTABLE_API_KEY = "atm_env";
    process.env.ALTERTABLE_ENV = "staging";

    const lakehouseToken = Buffer.from("env-user:env-pass").toString("base64");
    expect(getLakehouseAuthHeader(FROM_ENV_PSEUDOPROFILE_NAME)).toBe(
      `Authorization: Basic ${lakehouseToken}`,
    );
    expect(getManagementAuthHeader(FROM_ENV_PSEUDOPROFILE_NAME)).toBe(
      "Authorization: Bearer atm_env",
    );
    expect(requireManagementEnv(FROM_ENV_PSEUDOPROFILE_NAME)).toBe("staging");
  });

  test("ignores environment credentials for stored profiles", () => {
    configSet("user", "alice", profileName);
    secretSet("lakehouse/password", "lakehouse-secret", profileName);
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "env-basic-token";

    const lakehouseToken = Buffer.from("alice:lakehouse-secret").toString("base64");
    expect(getLakehouseAuthHeader(profileName)).toBe(`Authorization: Basic ${lakehouseToken}`);
  });

  test("prefers the environment Basic token over environment username/password", () => {
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "env-basic-token";
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";

    expect(getLakehouseAuthHeader(FROM_ENV_PSEUDOPROFILE_NAME)).toBe(
      "Authorization: Basic env-basic-token",
    );
  });

  test("env pseudo-profile errors name the missing environment variables", () => {
    expect(() => getLakehouseAuthHeader(FROM_ENV_PSEUDOPROFILE_NAME)).toThrow(
      "No lakehouse credentials in the environment configuration. Set ALTERTABLE_BASIC_AUTH_TOKEN or ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD, or unset the ALTERTABLE_* configuration variables to use a stored profile.",
    );
    expect(() => getManagementAuthHeader(FROM_ENV_PSEUDOPROFILE_NAME)).toThrow(
      "No management credentials in the environment configuration. Set ALTERTABLE_API_KEY, or unset the ALTERTABLE_* configuration variables to use a stored profile.",
    );
    expect(() => requireManagementEnv(FROM_ENV_PSEUDOPROFILE_NAME)).toThrow(
      "No environment set in the environment configuration. Set ALTERTABLE_ENV.",
    );
  });

  test("getLakehouseCredentialPair returns stored username/password credentials", () => {
    configSet("user", "alice", profileName);
    secretSet("lakehouse/password", "s3cret", profileName);

    expect(getLakehouseCredentialPair(profileName)).toEqual({ user: "alice", password: "s3cret" });
  });

  test("getLakehouseCredentialPair decodes a stored basic token", () => {
    secretSet("lakehouse/basic-token", Buffer.from("alice:s3cret").toString("base64"), profileName);

    expect(getLakehouseCredentialPair(profileName)).toEqual({ user: "alice", password: "s3cret" });
  });

  test("getLakehouseCredentialPair preserves colons in decoded passwords", () => {
    secretSet(
      "lakehouse/basic-token",
      Buffer.from("alice:pa:ss:word").toString("base64"),
      profileName,
    );

    expect(getLakehouseCredentialPair(profileName)).toEqual({
      user: "alice",
      password: "pa:ss:word",
    });
  });

  test("getLakehouseCredentialPair resolves environment credentials", () => {
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";

    expect(getLakehouseCredentialPair(FROM_ENV_PSEUDOPROFILE_NAME)).toEqual({
      user: "env-user",
      password: "env-pass",
    });
  });

  test("getLakehouseCredentialPair rejects a token without decodable credentials", () => {
    secretSet("lakehouse/basic-token", Buffer.from("no-separator").toString("base64"), profileName);

    expect(() => getLakehouseCredentialPair(profileName)).toThrow(
      "The configured lakehouse basic token does not decode to user:password credentials.",
    );
  });
});
