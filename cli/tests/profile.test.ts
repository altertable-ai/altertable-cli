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
  getActiveProfileName,
  inspectProfile,
  listProfiles,
  profileConfigFile,
  profileExists,
  renameProfile,
  resolveProfileName,
  setActiveProfile,
  updateProfile,
} from "@/features/profile/model.ts";
import { promptProfileSwitch } from "@/commands/profile.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import {
  buildProfileDirenvView,
  buildProfileInspectView,
  buildProfileListView,
  buildProfileShellExportView,
} from "@/features/profile/views.ts";
import { setCliContext, getCliContext } from "@/context.ts";
import { runCommandWithTestRuntime } from "@tests/cli-test-runtime.ts";

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

  test("configure writes credentials to an explicit profile", async () => {
    await configureRunSet({ profile: "acme_production", apiKey: "atm_prod", env: "Production" });

    expect(profileExists("acme_production")).toBe(true);
    setCliContext({ debug: false, json: false, agent: false, profile: "acme_production" });
    expect(configGet("api_key_env")).toBe("Production");
    expect(secretGet("api-key")).toBe("atm_prod");
    expect(
      listProfiles().find((profile) => profile.name === "acme_production")?.management_auth,
    ).toBe("api-key");
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

  test("profile create switches to the created profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });

    await runCommandWithTestRuntime(["profile", "create", "acme_stage", "--env", "staging"]);

    expect(getActiveProfileName()).toBe("acme_stage");
  });

  test("inspectProfile reports profile-scoped auth status", async () => {
    await configureRunSet({ profile: "acme_prod", apiKey: "atm_prod", env: "production" });
    await configureRunSet({ profile: "acme_prod", user: "alice", password: "secret" });
    const lakehouseExpiry = Date.now() + 60 * 60 * 1000;
    setCliContext({ debug: false, json: false, agent: false, profile: "acme_prod" });
    configSet("lakehouse_credential_expiry", String(lakehouseExpiry));

    const profile = inspectProfile("acme_prod");
    expect(profile.status).toBe("configured");
    expect(profile.auth.management).toBe("api_key");
    expect(profile.auth.lakehouse).toBe("username_password");
    expect(profile.timestamps.created_at).toBeTruthy();
    expect(profile.timestamps.lakehouse_expires_at).toBe(new Date(lakehouseExpiry).toISOString());
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

  test("profile list view describes table columns declaratively", async () => {
    await configureRunSet({ profile: "acme_prod", org: "acme", apiKey: "atm_prod", env: "prod" });
    const view = buildProfileListView(listProfiles());
    const [section] = view.document.sections;
    const [block] = section?.blocks ?? [];

    expect(block?.kind).toBe("table");
    if (block?.kind === "table") {
      expect(block.table.columns.map((column) => column.header)).toEqual([
        "  NAME",
        "ORG",
        "PRINCIPAL",
        "ENV",
        "MGMT",
        "LAKEHOUSE",
        "OAUTH EXPIRES",
        "STATUS",
        "DATA PLANE",
      ]);
      expect(block.table.emptyMessage).toBe("No profiles configured.");
    }
  });

  test("profile inspect view exposes display rows", () => {
    createProfile("acme_prod", {
      organizationSlug: "acme",
      environment: "production",
      dataPlane: "https://api.example.com",
    });

    const view = buildProfileInspectView(inspectProfile("acme_prod"));
    const [section] = view.document.sections;
    const [block] = section?.blocks ?? [];

    expect(block?.kind).toBe("rows");
    if (block?.kind === "rows") {
      expect(block.rows).toEqual(
        expect.arrayContaining([
          { label: "Profile", value: "acme_prod" },
          { label: "Organization", value: "acme" },
          { label: "Data plane", value: "https://api.example.com", linkifyUrls: true },
        ]),
      );
    }
  });

  test("profile shell views share the same export data", () => {
    expect(buildProfileShellExportView("acme_prod")).toEqual({
      env: { ALTERTABLE_PROFILE: "acme_prod" },
      lines: ['export ALTERTABLE_PROFILE="acme_prod"'],
    });
    expect(buildProfileDirenvView("acme_prod")).toEqual({
      env: { ALTERTABLE_PROFILE: "acme_prod" },
      lines: ["# Generated by: altertable profile direnv", 'export ALTERTABLE_PROFILE="acme_prod"'],
    });
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

  test("deleteProfile allows deleting the last inactive profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("staging");

    deleteProfile("default");

    expect(profileExists("default")).toBe(false);
    expect(profileExists("staging")).toBe(true);
    expect(() => deleteProfile("staging")).toThrow("Cannot delete the active profile");
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

  test("renameProfile restores the profile directory if keychain secret migration fails", () => {
    createProfile("staging");
    const spawnCalls: string[][] = [];
    setSpawnSyncForTests((_command, args) => {
      spawnCalls.push([...args]);
      const account = args[args.indexOf("-a") + 1] ?? "";
      if (args.includes("help")) {
        return {
          status: 0,
          stdout: Buffer.from(""),
          stderr: Buffer.from(""),
          pid: 0,
          signal: null,
          output: [null, Buffer.from(""), Buffer.from("")],
        };
      }
      if (args.includes("find-generic-password")) {
        if (account === "profile/staging/api-key") {
          return {
            status: 0,
            stdout: Buffer.from("atm_staging"),
            stderr: Buffer.from(""),
            pid: 0,
            signal: null,
            output: [null, Buffer.from("atm_staging"), Buffer.from("")],
          };
        }
        if (account === "profile/staging/lakehouse/password") {
          return {
            status: 0,
            stdout: Buffer.from("secret"),
            stderr: Buffer.from(""),
            pid: 0,
            signal: null,
            output: [null, Buffer.from("secret"), Buffer.from("")],
          };
        }
        return {
          status: 1,
          stdout: Buffer.from(""),
          stderr: Buffer.from(""),
          pid: 0,
          signal: null,
          output: [null, Buffer.from(""), Buffer.from("")],
        };
      }
      if (
        args.includes("add-generic-password") &&
        account === "profile/acme_staging/lakehouse/password"
      ) {
        return {
          status: 1,
          stdout: Buffer.from(""),
          stderr: Buffer.from(""),
          pid: 0,
          signal: null,
          output: [null, Buffer.from(""), Buffer.from("")],
        };
      }
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
      expect(() => renameProfile("staging", "acme_staging")).toThrow(
        "Failed to store secret in macOS keychain",
      );
      expect(profileExists("staging")).toBe(true);
      expect(profileExists("acme_staging")).toBe(false);
      expect(
        spawnCalls.some(
          (args) =>
            args.includes("delete-generic-password") &&
            args.includes("profile/acme_staging/api-key"),
        ),
      ).toBe(true);
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor);
      }
      process.env.ALTERTABLE_SECRET_BACKEND = "file";
      setSpawnSyncForTests(undefined);
    }
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

  test("promptProfileSwitch selects from configured profiles", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });

    const selected = await promptProfileSwitch({
      writePrompt() {},
      readLine: async () => "",
      readPassword: async () => "",
      readConfirm: async () => true,
      readSelect: async (title, options, defaultValue) => {
        expect(title).toBe("Switch profile");
        expect(defaultValue).toBe("default");
        expect(options.map((option) => option.value)).toContain("staging");
        expect(options.find((option) => option.value === "staging")?.label).toContain(
          "env: staging",
        );
        return "staging";
      },
    });

    expect(selected).toBe("staging");
  });

  test("profile status runs without live verification by default", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });

    await runCommandWithTestRuntime(["profile", "status", "--name", "staging"]);
  });
});
