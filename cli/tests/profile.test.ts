import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configGet, configSet, kvGet } from "@/lib/config.ts";
import { configureRunSet } from "@/lib/configure.ts";
import {
  resetSecretWarningsForTests,
  secretGet,
  secretSet,
  setSpawnSyncForTests,
} from "@/lib/secrets.ts";
import {
  DEFAULT_PROFILE_NAME,
  createProfile,
  deleteProfile,
  deriveProfileName,
  ensureProfilesLayout,
  exportProfile,
  getActiveProfileName,
  importProfile,
  inspectProfile,
  listProfiles,
  profileConfigFile,
  profileExists,
  renameProfile,
  resolveProfileName,
  setActiveProfile,
  updateProfile,
} from "@/lib/profile.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { setCliContext, getCliContext } from "@/context.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-profile-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  resetSecretWarningsForTests();
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_PROFILE;
});

describe("profiles layout", () => {
  test("creates profiles/default and sets active_profile on first access", () => {
    ensureProfilesLayout();

    expect(existsSync(profileConfigFile(DEFAULT_PROFILE_NAME))).toBe(false);
    expect(existsSync(join(testHome, "profiles", "default"))).toBe(true);
    expect(kvGet(join(testHome, "config"), "active_profile")).toBe(DEFAULT_PROFILE_NAME);
  });
});

describe("resolveProfileName", () => {
  test("prefers CLI context profile over active profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });

    setActiveProfile("default");
    setCliContext({ debug: false, json: false, agent: false, profile: "staging" });
    expect(resolveProfileName(getCliContext().profile)).toBe("staging");
  });

  test("prefers ALTERTABLE_PROFILE over active profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("default");
    process.env.ALTERTABLE_PROFILE = "staging";
    expect(resolveProfileName()).toBe("staging");
  });

  test("returns active profile by default", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    expect(resolveProfileName()).toBe(DEFAULT_PROFILE_NAME);
    expect(getActiveProfileName()).toBe(DEFAULT_PROFILE_NAME);
  });
});

describe("profile storage", () => {
  test("derives safe org_env profile names", () => {
    expect(deriveProfileName("Acme Inc.", "Production")).toBe("acme-inc_production");
    expect(deriveProfileName("acme", "prod/eu")).toBe("acme_prod-eu");
  });

  test("configure --org derives profile name and stores organization metadata", async () => {
    await configureRunSet({ org: "Acme", apiKey: "atm_prod", env: "Production" });

    expect(profileExists("acme_production")).toBe(true);
    setCliContext({ debug: false, json: false, agent: false, profile: "acme_production" });
    expect(configGet("api_key_env")).toBe("Production");
    expect(configGet("organization_slug")).toBe("Acme");
    expect(secretGet("api-key")).toBe("atm_prod");
    expect(listProfiles().find((profile) => profile.name === "acme_production")?.organization).toBe(
      "Acme",
    );
  });

  test("createProfile and updateProfile manage metadata without credentials", () => {
    const created = createProfile("acme_prod", {
      organizationSlug: "acme",
      organizationName: "Acme Inc",
      environment: "production",
      description: "Acme production",
      dataPlane: "https://api.example.com",
      controlPlane: "https://app.example.com",
    });

    expect(created.name).toBe("acme_prod");
    expect(created.status).toBe("partial");
    expect(created.organization.slug).toBe("acme");
    expect(created.environment).toBe("production");

    const updated = updateProfile("acme_prod", { description: "Primary prod" });
    expect(updated.description).toBe("Primary prod");
    expect(inspectProfile("acme_prod").endpoints.data_plane).toBe("https://api.example.com");
  });

  test("inspectProfile reports profile-scoped auth status", async () => {
    await configureRunSet({ profile: "acme_prod", apiKey: "atm_prod", env: "production" });
    await configureRunSet({ profile: "acme_prod", user: "alice", password: "secret" });

    const profile = inspectProfile("acme_prod");
    expect(profile.status).toBe("configured");
    expect(profile.auth.management).toBe("api_key");
    expect(profile.auth.lakehouse).toBe("username_password");
    expect(profile.timestamps.created_at).toBeTruthy();
  });

  test("exportProfile and importProfile copy config without secrets", async () => {
    await configureRunSet({ profile: "acme_prod", org: "acme", apiKey: "atm_prod", env: "prod" });
    const exported = exportProfile("acme_prod");

    expect(exported.secrets_included).toBe(false);
    expect(exported.profile.config.organization_slug).toBe("acme");
    expect(JSON.stringify(exported)).not.toContain("atm_prod");

    const imported = importProfile(exported, "acme_prod_copy");
    expect(imported.organization.slug).toBe("acme");
    expect(secretGet("api-key", "acme_prod_copy")).toBe("");
  });

  test("configure creates implicit profile directories", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });
    expect(profileExists("staging")).toBe(true);
    setCliContext({ debug: false, json: false, agent: false, profile: "staging" });
    expect(configGet("api_key_env")).toBe("staging");
    expect(secretGet("api-key")).toBe("atm_staging");
  });

  test("listProfiles marks the active profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("staging");

    const profiles = listProfiles();
    expect(profiles.find((profile) => profile.name === "staging")?.active).toBe(true);
    expect(profiles.find((profile) => profile.name === "default")?.active).toBe(false);
  });

  test("global query defaults stay in root config across profiles", async () => {
    configSet("query_layout", "line");
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    expect(kvGet(join(testHome, "config"), "query_layout")).toBe("line");
    expect(kvGet(profileConfigFile("staging"), "query_layout")).toBe("");
  });

  test("deleteProfile refuses to delete the active profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("staging");
    expect(() => deleteProfile("staging")).toThrow("Cannot delete the active profile");
  });

  test("deleteProfile refuses to delete the last profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    expect(() => deleteProfile("default")).toThrow("Cannot delete the last profile");
  });

  test("deleteProfile removes secrets via secretDelete including keychain", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("default");

    const spawnCalls: string[][] = [];
    setSpawnSyncForTests((_command, args) => {
      spawnCalls.push([...args]);
      return {
        status: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
        pid: 0,
        signal: null,
        output: [null, Buffer.from(""), Buffer.from("")],
      };
    });

    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "darwin" });

    try {
      process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
      secretSet("api-key", "atm_b", "staging");
      deleteProfile("staging");
      const keychainDeletes = spawnCalls.filter((args) => args.includes("delete-generic-password"));
      expect(keychainDeletes.length).toBeGreaterThan(0);
      expect(profileExists("staging")).toBe(false);
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor);
      }
      process.env.ALTERTABLE_SECRET_BACKEND = "file";
      setSpawnSyncForTests(undefined);
    }
  });

  test("renameProfile moves profile config, active profile, and secrets", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });
    setActiveProfile("staging");

    renameProfile("staging", "acme_staging");

    expect(profileExists("staging")).toBe(false);
    expect(profileExists("acme_staging")).toBe(true);
    expect(getActiveProfileName()).toBe("acme_staging");
    expect(secretGet("api-key", "acme_staging")).toBe("atm_staging");
    expect(secretGet("api-key", "staging")).toBe("");
  });

  test("rejects path traversal profile names", () => {
    expect(() => resolveProfileName("../../outside")).toThrow(ConfigurationError);
    expect(() => setActiveProfile("..")).toThrow(ConfigurationError);
    expect(() => deleteProfile("foo/bar")).toThrow(ConfigurationError);
  });

  test("allows valid profile names", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });
    await configureRunSet({ profile: "prod-eu", apiKey: "atm_prod", env: "prod" });
    expect(profileExists("staging")).toBe(true);
    expect(profileExists("prod-eu")).toBe(true);
  });
});
