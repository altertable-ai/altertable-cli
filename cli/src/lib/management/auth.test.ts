import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getManagementAuthHeader, requireManagementPlane } from "@/lib/auth.ts";
import { configSet } from "@/lib/config.ts";
import { FROM_ENV_PSEUDOPROFILE_NAME } from "@/lib/profile-store.ts";
import { secretSet } from "@/lib/secrets.ts";
import { storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { setCliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";

const profileName = "default";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-mgmt-auth-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  delete process.env.ALTERTABLE_API_KEY;
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
});

describe("getManagementAuthHeader precedence", () => {
  test("throws when nothing is configured", () => {
    expect(() => getManagementAuthHeader(profileName)).toThrow(ConfigurationError);
  });

  test("uses the stored api-key when it is the only credential", () => {
    secretSet("api-key", "atm_stored", profileName);
    expect(getManagementAuthHeader(profileName)).toBe("Authorization: Bearer atm_stored");
  });

  test("OAuth access token beats the stored api-key", () => {
    secretSet("api-key", "atm_stored", profileName);
    storeOAuthTokens(
      { access_token: "oauth_tok", refresh_token: "r", expires_in: 3600 },
      profileName,
    );
    expect(getManagementAuthHeader(profileName)).toBe("Authorization: Bearer oauth_tok");
  });

  test("ALTERTABLE_API_KEY applies only to the env pseudo-profile", () => {
    secretSet("api-key", "atm_stored", profileName);
    storeOAuthTokens({ access_token: "oauth_tok", expires_in: 3600 }, profileName);
    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(getManagementAuthHeader(FROM_ENV_PSEUDOPROFILE_NAME)).toBe(
      "Authorization: Bearer atm_env",
    );
    expect(getManagementAuthHeader(profileName)).toBe("Authorization: Bearer oauth_tok");
  });
});

describe("requireManagementPlane", () => {
  test("returns the environment for a fully configured profile", () => {
    secretSet("api-key", "atm_stored", profileName);
    configSet("api_key_env", "production", profileName);

    expect(requireManagementPlane(profileName, { requirement: "Doing X" })).toBe("production");
  });

  test("reports the unconfigured management plane for a lakehouse-only profile", () => {
    configSet("user", "alice", profileName);
    secretSet("lakehouse/password", "s3cret", profileName);

    expect(() => requireManagementPlane(profileName, { requirement: "Doing X" })).toThrow(
      "Doing X, but the management plane is not configured. Run 'altertable login' or 'altertable profile configure --api-key atm_xxx --env <name>'.",
    );
  });

  test("appends the alternative to the remediation", () => {
    expect(() =>
      requireManagementPlane(profileName, { requirement: "Doing X", alternative: "do Y instead" }),
    ).toThrow(
      "Doing X, but the management plane is not configured. Run 'altertable login' or 'altertable profile configure --api-key atm_xxx --env <name>', or do Y instead.",
    );
  });

  test("requires both the env API key and environment in env configuration mode", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";

    expect(() =>
      requireManagementPlane(FROM_ENV_PSEUDOPROFILE_NAME, { requirement: "Doing X" }),
    ).toThrow(
      "Doing X, but the management plane is not configured. Set ALTERTABLE_API_KEY and ALTERTABLE_ENV.",
    );

    process.env.ALTERTABLE_ENV = "staging";
    expect(requireManagementPlane(FROM_ENV_PSEUDOPROFILE_NAME, { requirement: "Doing X" })).toBe(
      "staging",
    );
  });
});
