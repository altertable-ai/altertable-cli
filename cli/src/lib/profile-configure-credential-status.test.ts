import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildConfigureShowData,
  configureCredentialStatus,
  lakehousePlaneStatusDetail,
  managementPlaneStatusDetail,
} from "@/lib/profile/model.ts";
import {
  formatConfigureAuthenticationLines,
  formatConfigureSessionSummary,
} from "@/lib/profile/render.ts";
import { secretSet } from "@/lib/secrets.ts";
import { configSet } from "@/lib/config.ts";

const profileName = "default";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-credential-status-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
  delete process.env.ALTERTABLE_ENV;
});

describe("configureCredentialStatus", () => {
  test("detects stored and environment credentials", () => {
    expect(configureCredentialStatus(profileName)).toEqual({
      hasManagement: false,
      hasLakehouse: false,
    });

    secretSet("api-key", "atm_test", profileName);
    expect(configureCredentialStatus(profileName).hasManagement).toBe(true);

    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(configureCredentialStatus(profileName).hasManagement).toBe(true);

    secretSet("lakehouse/password", "secret", profileName);
    configSet("user", "alice", profileName);
    expect(configureCredentialStatus(profileName).hasLakehouse).toBe(true);
  });

  test("detects environment lakehouse credentials without stored secrets", () => {
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    expect(configureCredentialStatus(profileName)).toEqual({
      hasManagement: false,
      hasLakehouse: true,
    });
  });

  test("plane status detail reflects environment credentials", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(managementPlaneStatusDetail(profileName)).toBe("via ALTERTABLE_API_KEY");

    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "dG9rZW4=";
    expect(lakehousePlaneStatusDetail(profileName)).toBe("via ALTERTABLE_BASIC_AUTH_TOKEN");

    delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    expect(lakehousePlaneStatusDetail(profileName)).toBe("env-user");
  });
});

describe("formatConfigureAuthenticationLines", () => {
  test("includes environment-only management credentials", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";
    process.env.ALTERTABLE_ENV = "staging";

    const lines = formatConfigureAuthenticationLines(profileName, { planes: ["management"] });
    expect(lines.join("\n")).toContain("ALTERTABLE_API_KEY");
    expect(lines.join("\n")).toContain("staging");
  });

  test("session summary includes only configured planes", () => {
    secretSet("api-key", "atm_test", profileName);
    configSet("api_key_env", "production", profileName);
    secretSet("lakehouse/password", "secret", profileName);
    configSet("user", "alice", profileName);

    const summary = formatConfigureSessionSummary(profileName, ["management"]);
    expect(summary.join("\n")).toContain("management API key");
    expect(summary.join("\n")).not.toContain("lakehouse");
  });
});

describe("OAuth login status", () => {
  function loginViaOAuth(): void {
    secretSet("oauth/access-token", "tok", profileName);
    configSet("oauth_expiry", String(Date.now() + 3_600_000), profileName);
    configSet("api_key_env", "production", profileName);
  }

  test("counts as a management credential", () => {
    loginViaOAuth();
    expect(configureCredentialStatus(profileName).hasManagement).toBe(true);
  });

  test("shows browser login (OAuth), not the api-key lines", () => {
    loginViaOAuth();
    configSet("organization_slug", "altertable", profileName);
    configSet("organization_name", "Altertable", profileName);
    const text = formatConfigureAuthenticationLines(profileName, { planes: ["management"] }).join(
      "\n",
    );
    expect(text).toContain("browser login (OAuth)");
    expect(text).toContain("production");
    expect(text).toContain("Organization:");
    expect(text).toContain("Altertable (altertable)");
    expect(text).not.toContain("api key:");
    expect(text).not.toContain("management API key");
  });

  test("OAuth login shadows a leftover stored api key", () => {
    secretSet("api-key", "atm_leftover", profileName);
    loginViaOAuth();
    const text = formatConfigureAuthenticationLines(profileName, { planes: ["management"] }).join(
      "\n",
    );
    expect(text).toContain("browser login (OAuth)");
    expect(text).not.toContain("api key:");
    expect(managementPlaneStatusDetail(profileName)).toBe("OAuth login (production)");
    expect(buildConfigureShowData(profileName).credentials.management).toMatchObject({
      mechanism: "management_oauth",
      oauth: "set",
    });
  });

  test("ALTERTABLE_API_KEY env still takes precedence over OAuth", () => {
    loginViaOAuth();
    process.env.ALTERTABLE_API_KEY = "atm_env";
    const text = formatConfigureAuthenticationLines(profileName, { planes: ["management"] }).join(
      "\n",
    );
    expect(text).toContain("ALTERTABLE_API_KEY");
    expect(text).not.toContain("browser login (OAuth)");
    expect(managementPlaneStatusDetail(profileName)).toBe("via ALTERTABLE_API_KEY");
  });
});

describe("buildConfigureShowData", () => {
  test("returns structured credential status without secrets", () => {
    secretSet("api-key", "atm_test", profileName);
    configSet("api_key_env", "production", profileName);
    secretSet("lakehouse/password", "lakehouse-pass", profileName);
    configSet("user", "alice", profileName);

    const data = buildConfigureShowData(profileName);
    expect(data.credentials.management).toEqual({
      configured: true,
      mechanism: "management_api_key",
      source: "stored",
      environment: "production",
      api_key: "set",
    });
    expect(data.credentials.lakehouse).toEqual({
      configured: true,
      mechanism: "lakehouse_username_password",
      source: "stored",
      user: "alice",
      password: "set",
    });
    expect(JSON.stringify(data)).not.toContain("atm_test");
    expect(JSON.stringify(data)).not.toContain("lakehouse-pass");
  });

  test("includes environment overrides", () => {
    secretSet("api-key", "atm_test", profileName);
    configSet("api_key_env", "production", profileName);
    process.env.ALTERTABLE_ENV = "staging";
    process.env.ALTERTABLE_API_KEY = "atm_override";

    const data = buildConfigureShowData(profileName);
    expect(data.overrides).toEqual({
      environment: "staging",
      stored_environment: "production",
      api_key: true,
    });
    expect(JSON.stringify(data)).not.toContain("atm_override");
  });
});
