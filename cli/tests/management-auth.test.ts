import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getManagementAuthHeader } from "@/lib/auth.ts";
import { secretSet } from "@/lib/secrets.ts";
import { storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { setCliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";

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
});

describe("getManagementAuthHeader precedence", () => {
  test("throws when nothing is configured", () => {
    expect(() => getManagementAuthHeader()).toThrow(ConfigurationError);
  });

  test("uses the stored api-key when it is the only credential", () => {
    secretSet("api-key", "atm_stored");
    expect(getManagementAuthHeader()).toBe("Authorization: Bearer atm_stored");
  });

  test("OAuth access token beats the stored api-key", () => {
    secretSet("api-key", "atm_stored");
    storeOAuthTokens({ access_token: "oauth_tok", refresh_token: "r", expires_in: 3600 });
    expect(getManagementAuthHeader()).toBe("Authorization: Bearer oauth_tok");
  });

  test("ALTERTABLE_API_KEY env beats everything", () => {
    secretSet("api-key", "atm_stored");
    storeOAuthTokens({ access_token: "oauth_tok", expires_in: 3600 });
    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(getManagementAuthHeader()).toBe("Authorization: Bearer atm_env");
  });
});
