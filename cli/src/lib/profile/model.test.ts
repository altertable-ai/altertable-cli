import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configGet, configSet, configSetGlobal, kvGet } from "@/lib/config.ts";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import { secretGet } from "@/lib/secrets.ts";
import {
  createEmptyProfile,
  deleteProfile,
  deriveProfileName,
  inspectProfile,
  listProfiles,
  renameProfile,
  updateProfile,
} from "@/lib/profile/model.ts";
import {
  DEFAULT_PROFILE_NAME,
  ensureProfilesLayout,
  getActiveProfileName,
  profileConfigFile,
  profileExists,
  resolveWorkingProfile,
  setActiveProfile,
} from "@/lib/profile-store.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import {
  buildProfileDirenvView,
  buildProfileInspectView,
  buildProfileListView,
  buildProfileShellExportView,
  profileStatusToJson,
  type ProfileStatusResult,
} from "@/lib/profile/views.ts";
import { formatProfileInspect, formatProfileStatus } from "@/lib/profile/render.ts";
import { setCliContext, getCliContext } from "@/context.ts";
import { renderShellExportView } from "@/ui/shell/render.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-profile-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
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

describe("resolveWorkingProfile", () => {
  test("prefers CLI context profile over active profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });

    setActiveProfile("default");
    setCliContext({ debug: false, json: false, agent: false, profile: "staging" });
    expect(resolveWorkingProfile(getCliContext().profile)).toBe("staging");
  });

  test("prefers ALTERTABLE_PROFILE over active profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("default");
    process.env.ALTERTABLE_PROFILE = "staging";
    expect(resolveWorkingProfile()).toBe("staging");
  });

  test("returns active profile by default", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    expect(resolveWorkingProfile()).toBe(DEFAULT_PROFILE_NAME);
    expect(getActiveProfileName()).toBe(DEFAULT_PROFILE_NAME);
  });
});

describe("profile storage", () => {
  test("derives safe org_env profile names", () => {
    expect(deriveProfileName("Acme Inc.", "Production")).toBe("acme-inc_production");
    expect(deriveProfileName("acme", "prod/eu")).toBe("acme_prod-eu");
  });

  test("profile --configure writes credentials to an explicit profile", async () => {
    await configureRunSet({ profile: "acme_production", apiKey: "atm_prod", env: "Production" });

    expect(profileExists("acme_production")).toBe(true);
    setCliContext({ debug: false, json: false, agent: false, profile: "acme_production" });
    expect(configGet("api_key_env", "acme_production")).toBe("Production");
    expect(secretGet("api-key", "acme_production")).toBe("atm_prod");
    expect(
      listProfiles().find((profile) => profile.name === "acme_production")?.management_auth,
    ).toBe("api-key");
  });

  test("createEmptyProfile and updateProfile manage metadata without credentials", () => {
    createEmptyProfile("acme_prod");
    const created = updateProfile("acme_prod", {
      organizationSlug: "acme",
      organizationName: "Acme Inc",
      environment: "production",
      dataPlane: "https://api.example.com",
      controlPlane: "https://app.example.com",
    });

    expect(created.name).toBe("acme_prod");
    expect(created.status).toBe("partial");
    expect(created.organization.slug).toBe("acme");
    expect(created.environment).toBe("production");

    expect(inspectProfile("acme_prod").endpoints.data_plane).toBe("https://api.example.com");
  });

  test("inspectProfile reports profile-scoped auth status", async () => {
    await configureRunSet({ profile: "acme_prod", apiKey: "atm_prod", env: "production" });
    await configureRunSet({ profile: "acme_prod", user: "alice", password: "secret" });
    const lakehouseExpiry = Date.now() + 60 * 60 * 1000;
    setCliContext({ debug: false, json: false, agent: false, profile: "acme_prod" });
    configSet("lakehouse_credential_expiry", String(lakehouseExpiry), "acme_prod");

    const profile = inspectProfile("acme_prod");
    expect(profile.status).toBe("configured");
    expect(profile.auth.management).toBe("api_key");
    expect(profile.auth.lakehouse).toBe("username_password");
    expect(profile.timestamps.created_at).toBeTruthy();
    expect(profile.timestamps.lakehouse_expires_at).toBe(new Date(lakehouseExpiry).toISOString());
  });

  test("profile --configure creates implicit profile directories", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });
    expect(profileExists("staging")).toBe(true);
    setCliContext({ debug: false, json: false, agent: false, profile: "staging" });
    expect(configGet("api_key_env", "staging")).toBe("staging");
    expect(secretGet("api-key", "staging")).toBe("atm_staging");
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
    await configureRunSet({ profile: "acme_prod", apiKey: "atm_prod", env: "prod" });
    const view = buildProfileListView(listProfiles());
    const [section] = view.sections;
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
    createEmptyProfile("acme_prod");
    updateProfile("acme_prod", {
      organizationSlug: "acme",
      environment: "production",
      dataPlane: "https://api.example.com",
    });

    const view = buildProfileInspectView(inspectProfile("acme_prod"));
    const [section] = view.sections;
    const [block] = section?.blocks ?? [];

    expect(block?.kind).toBe("rows");
    if (block?.kind === "rows") {
      expect(block.rows).toEqual(
        expect.arrayContaining([
          { label: "Profile", value: "acme_prod" },
          { label: "Organization", value: "acme" },
          {
            label: "Data plane",
            value: [
              {
                text: "https://api.example.com",
                style: "accent",
                href: "https://api.example.com",
              },
            ],
          },
        ]),
      );
    }
  });

  test("profile shell views share the same export data", () => {
    expect(buildProfileShellExportView("acme_prod")).toEqual({
      env: { ALTERTABLE_PROFILE: "acme_prod" },
    });
    expect(buildProfileDirenvView("acme_prod")).toEqual({
      env: { ALTERTABLE_PROFILE: "acme_prod" },
      comments: ["Generated by: altertable profile direnv"],
    });
    expect(renderShellExportView(buildProfileShellExportView("acme_prod"))).toBe(
      'export ALTERTABLE_PROFILE="acme_prod"',
    );
    expect(renderShellExportView(buildProfileDirenvView("acme_prod"))).toBe(
      '# Generated by: altertable profile direnv\nexport ALTERTABLE_PROFILE="acme_prod"',
    );
  });

  test("global query defaults stay in root config across profiles", async () => {
    configSetGlobal("query_layout", "line");
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
    expect(() => resolveWorkingProfile("../../outside")).toThrow(ConfigurationError);
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

describe("profile show view", () => {
  test("renders the stored profile's auth, environment, and config file", async () => {
    await configureRunSet({ apiKey: "atm_show", env: "production" });

    const output = formatProfileInspect(inspectProfile(getActiveProfileName()));

    expect(output).toContain("Management auth");
    expect(output).toContain("api_key");
    expect(output).toContain("Environment");
    expect(output).toContain("production");
    expect(output).toContain("Config file");
    expect(output).not.toContain("atm_show");
  });

  test("marks an unconfigured profile as empty with no auth", () => {
    const output = formatProfileInspect(inspectProfile(getActiveProfileName()));

    expect(output).toContain("Status");
    expect(output).toContain("empty");
    expect(output).toContain("none");
  });
});

describe("profile status view", () => {
  function statusResult(verification: ProfileStatusResult["verification"]): ProfileStatusResult {
    return { profile: inspectProfile(getActiveProfileName()), verification };
  }

  test("renders the inspect view plus a verification section", async () => {
    await configureRunSet({ apiKey: "atm_status", env: "production" });

    const output = formatProfileStatus(
      statusResult({
        profile: getActiveProfileName(),
        configured: ["management"],
        verified: { management: true, lakehouse: false },
        errors: [],
      }),
    );

    expect(output).toContain("Management auth");
    expect(output).toContain("Verification:");
    expect(output).toContain("Management:");
    expect(output).toContain("verified");
  });

  test("json envelope includes the profile and verification result", async () => {
    await configureRunSet({ apiKey: "atm_status", env: "production" });

    const json = profileStatusToJson(
      statusResult({
        profile: getActiveProfileName(),
        configured: ["management"],
        verified: { management: true, lakehouse: false },
        errors: [],
      }),
    );

    expect((json.verification as { configured: string[] }).configured).toEqual(["management"]);
    expect((json.profile as { name: string }).name).toBe(getActiveProfileName());
  });
});
