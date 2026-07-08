import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildConfigureShowData,
  configureCredentialStatus,
  lakehousePlaneStatusDetail,
  managementPlaneStatusDetail,
} from "@/features/configure/model.ts";
import { buildConfigureShowView } from "@/features/configure/views.ts";
import {
  formatConfigureAuthenticationLines,
  formatConfigureSessionSummary,
} from "@/features/configure/render.ts";
import { secretSet } from "@/lib/secrets.ts";
import { configSet } from "@/lib/config.ts";

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
    expect(configureCredentialStatus()).toEqual({ hasManagement: false, hasLakehouse: false });

    secretSet("api-key", "atm_test");
    expect(configureCredentialStatus().hasManagement).toBe(true);

    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(configureCredentialStatus().hasManagement).toBe(true);

    secretSet("lakehouse/password", "secret");
    configSet("user", "alice");
    expect(configureCredentialStatus().hasLakehouse).toBe(true);
  });

  test("detects environment lakehouse credentials without stored secrets", () => {
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    expect(configureCredentialStatus()).toEqual({ hasManagement: false, hasLakehouse: true });
  });

  test("plane status detail reflects environment credentials", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";
    expect(managementPlaneStatusDetail()).toBe("via ALTERTABLE_API_KEY");

    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "dG9rZW4=";
    expect(lakehousePlaneStatusDetail()).toBe("via ALTERTABLE_BASIC_AUTH_TOKEN");

    delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "env-user";
    process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "env-pass";
    expect(lakehousePlaneStatusDetail()).toBe("env-user");
  });
});

describe("formatConfigureAuthenticationLines", () => {
  test("includes environment-only management credentials", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";
    process.env.ALTERTABLE_ENV = "staging";

    const lines = formatConfigureAuthenticationLines({ planes: ["management"] });
    expect(lines.join("\n")).toContain("ALTERTABLE_API_KEY");
    expect(lines.join("\n")).toContain("staging");
  });

  test("session summary includes only configured planes", () => {
    secretSet("api-key", "atm_test");
    configSet("api_key_env", "production");
    secretSet("lakehouse/password", "secret");
    configSet("user", "alice");

    const summary = formatConfigureSessionSummary(["management"]);
    expect(summary.join("\n")).toContain("management API key");
    expect(summary.join("\n")).not.toContain("lakehouse");
  });
});

describe("OAuth login status", () => {
  function loginViaOAuth(): void {
    secretSet("oauth/access-token", "tok");
    configSet("oauth_expiry", String(Date.now() + 3_600_000));
    configSet("api_key_env", "production");
  }

  test("counts as a management credential", () => {
    loginViaOAuth();
    expect(configureCredentialStatus().hasManagement).toBe(true);
  });

  test("shows browser login (OAuth), not the api-key lines", () => {
    loginViaOAuth();
    configSet("organization_slug", "altertable");
    configSet("organization_name", "Altertable");
    const text = formatConfigureAuthenticationLines({ planes: ["management"] }).join("\n");
    expect(text).toContain("browser login (OAuth)");
    expect(text).toContain("production");
    expect(text).toContain("Organization:");
    expect(text).toContain("Altertable (altertable)");
    expect(text).not.toContain("api key:");
    expect(text).not.toContain("management API key");
  });

  test("OAuth login shadows a leftover stored api key", () => {
    secretSet("api-key", "atm_leftover");
    loginViaOAuth();
    const text = formatConfigureAuthenticationLines({ planes: ["management"] }).join("\n");
    expect(text).toContain("browser login (OAuth)");
    expect(text).not.toContain("api key:");
    expect(managementPlaneStatusDetail()).toBe("OAuth login (production)");
    expect(buildConfigureShowData().credentials.management).toMatchObject({
      mechanism: "management_oauth",
      oauth: "set",
    });
  });

  test("ALTERTABLE_API_KEY env still takes precedence over OAuth", () => {
    loginViaOAuth();
    process.env.ALTERTABLE_API_KEY = "atm_env";
    const text = formatConfigureAuthenticationLines({ planes: ["management"] }).join("\n");
    expect(text).toContain("ALTERTABLE_API_KEY");
    expect(text).not.toContain("browser login (OAuth)");
    expect(managementPlaneStatusDetail()).toBe("via ALTERTABLE_API_KEY");
  });
});

describe("buildConfigureShowData", () => {
  test("returns structured credential status without secrets", () => {
    secretSet("api-key", "atm_test");
    configSet("api_key_env", "production");
    secretSet("lakehouse/password", "lakehouse-pass");
    configSet("user", "alice");

    const data = buildConfigureShowData();
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
    secretSet("api-key", "atm_test");
    configSet("api_key_env", "production");
    process.env.ALTERTABLE_ENV = "staging";
    process.env.ALTERTABLE_API_KEY = "atm_override";

    const data = buildConfigureShowData();
    expect(data.overrides).toEqual({
      environment: "staging",
      stored_environment: "production",
      api_key: true,
    });
    expect(JSON.stringify(data)).not.toContain("atm_override");
  });

  test("configure show view separates summary and authentication sections", () => {
    secretSet("api-key", "atm_test");
    configSet("api_key_env", "production");

    const view = buildConfigureShowView(buildConfigureShowData());
    const [summary, authentication] = view.sections;
    const [summaryRows] = summary?.blocks ?? [];
    const [authenticationRows] = authentication?.blocks ?? [];

    expect(summaryRows?.kind).toBe("rows");
    if (summaryRows?.kind === "rows") {
      expect(summaryRows.rows).toEqual(
        expect.arrayContaining([
          { label: "Active profile:", value: "default" },
          { label: "Data plane:", value: "https://api.altertable.ai", linkifyUrls: true },
        ]),
      );
    }

    expect(authenticationRows?.kind).toBe("rows");
    if (authenticationRows?.kind === "rows") {
      expect(authenticationRows.rows).toEqual(
        expect.arrayContaining([
          { label: "Authentication:", value: "management API key" },
          { label: "environment:", value: "production", level: 1 },
        ]),
      );
    }
  });
});
