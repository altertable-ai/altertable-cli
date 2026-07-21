import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setCliContext } from "@/context.ts";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import { ConfigurationError } from "@/lib/errors.ts";
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
  getActiveProfileName,
  profileConfigFile,
  profileDir,
  profileExists,
  setActiveProfile,
} from "@/lib/profile-store.ts";
import { secretGet } from "@/lib/secrets.ts";
import { createFakeKeychain } from "@/test-utils/keychain.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-profile-model-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe("profile model", () => {
  test("derives safe profile names from organization and environment", () => {
    expect(deriveProfileName("Acme Inc.", "Production")).toBe("acme-inc_production");
    expect(deriveProfileName("acme", "prod/eu")).toBe("acme_prod-eu");
  });

  test("creates and updates profile metadata without credentials", () => {
    createEmptyProfile("acme_prod");
    const profile = updateProfile("acme_prod", {
      organizationSlug: "acme",
      organizationName: "Acme Inc",
      environment: "production",
      dataPlane: "https://api.example.com",
      controlPlane: "https://app.example.com",
    });

    expect(profile).toMatchObject({
      name: "acme_prod",
      status: "partial",
      organization: { slug: "acme", name: "Acme Inc" },
      environment: "production",
      endpoints: {
        data_plane: "https://api.example.com",
        control_plane: "https://app.example.com",
      },
    });
  });

  test("inspects profile-scoped credentials and expiry metadata", async () => {
    await configureRunSet({ profile: "acme_prod", apiKey: "atm_prod", env: "production" });
    await configureRunSet({ profile: "acme_prod", user: "alice", password: "secret" });

    const profile = inspectProfile("acme_prod");
    expect(profile.status).toBe("configured");
    expect(profile.auth).toEqual({ management: "api_key", lakehouse: "username_password" });
    expect(profile.timestamps.created_at).toBeTruthy();
  });

  test("lists profiles with the active profile marked", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("staging");

    const profiles = listProfiles();
    expect(profiles.find((profile) => profile.name === "staging")?.active).toBe(true);
    expect(profiles.find((profile) => profile.name === "default")?.active).toBe(false);
  });

  test("refuses to delete the active profile but deletes an inactive profile", async () => {
    await configureRunSet({ apiKey: "atm_a", env: "prod" });
    await configureRunSet({ profile: "staging", apiKey: "atm_b", env: "staging" });
    setActiveProfile("staging");

    expect(() => deleteProfile("staging")).toThrow("Cannot delete the active profile");
    deleteProfile("default");

    expect(profileExists("default")).toBe(false);
    expect(profileExists("staging")).toBe(true);
  });

  test("deletes stored Keychain secrets before removing a profile", () => {
    createEmptyProfile("staging");
    process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
    const keychain = createFakeKeychain();
    keychain.store.secretSet("api-key", "atm_staging", "staging");
    keychain.store.secretSet("lakehouse/password", "lakehouse-secret", "staging");

    deleteProfile("staging", keychain.store);

    expect(profileExists("staging")).toBe(false);
    expect(keychain.store.secretGet("api-key", "staging")).toBe("");
    expect(keychain.store.secretGet("lakehouse/password", "staging")).toBe("");
    expect(
      keychain.calls.some(
        (args) =>
          args.includes("delete-generic-password") && args.includes("profile/staging/api-key"),
      ),
    ).toBe(true);
  });

  test("keeps the profile when Keychain secret deletion fails", () => {
    createEmptyProfile("staging");
    process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
    const keychain = createFakeKeychain();
    keychain.store.secretSet("api-key", "atm_staging", "staging");
    keychain.failingDeletes.add("profile/staging/api-key");

    expect(() => deleteProfile("staging", keychain.store)).toThrow(
      "Failed to delete secret from macOS keychain",
    );

    expect(profileExists("staging")).toBe(true);
    expect(keychain.store.secretGet("api-key", "staging")).toBe("atm_staging");
  });

  test("restores profile config and secrets when directory deletion fails", () => {
    createEmptyProfile("staging");
    updateProfile("staging", { organizationSlug: "acme", environment: "staging" });
    const originalConfig = readFileSync(profileConfigFile("staging"));
    const keychain = createFakeKeychain();
    keychain.store.secretSet("api-key", "atm_staging", "staging");

    expect(() =>
      deleteProfile("staging", keychain.store, {
        renameDirectory(source, target) {
          renameSync(profileDir(source), profileDir(target));
        },
        removeDirectory(name) {
          rmSync(profileConfigFile(name));
          throw new Error("simulated partial remove failure");
        },
        setActive: setActiveProfile,
      }),
    ).toThrow("simulated partial remove failure");

    expect(profileExists("staging")).toBe(true);
    expect(readFileSync(profileConfigFile("staging"))).toEqual(originalConfig);
    expect(keychain.store.secretGet("api-key", "staging")).toBe("atm_staging");
  });

  test("restores a configless profile after its quarantined directory was removed", () => {
    mkdirSync(profileDir("configless"), { recursive: true });
    const keychain = createFakeKeychain();

    expect(() =>
      deleteProfile("configless", keychain.store, {
        renameDirectory(source, target) {
          renameSync(profileDir(source), profileDir(target));
        },
        removeDirectory(name) {
          rmSync(profileDir(name), { recursive: true });
          throw new Error("simulated remove-then-fail");
        },
        setActive: setActiveProfile,
      }),
    ).toThrow("simulated remove-then-fail");

    expect(profileExists("configless")).toBe(true);
    expect(existsSync(profileConfigFile("configless"))).toBe(false);
  });

  test("reports incomplete recovery after profile deletion fails", () => {
    createEmptyProfile("staging");
    const keychain = createFakeKeychain();
    keychain.store.secretSet("api-key", "atm_staging", "staging");
    const secrets = {
      ...keychain.store,
      secretSet() {
        throw new Error("simulated secret restore failure");
      },
    };

    let thrown: unknown;
    try {
      deleteProfile("staging", secrets, {
        renameDirectory(source, target) {
          renameSync(profileDir(source), profileDir(target));
        },
        removeDirectory() {
          throw new Error("simulated deletion failure");
        },
        setActive: setActiveProfile,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigurationError);
    expect((thrown as ConfigurationError).message).toContain("rollback was incomplete");
    expect((thrown as ConfigurationError).cause).toBeInstanceOf(Error);
    expect(((thrown as ConfigurationError).cause as Error).message).toBe(
      "simulated deletion failure",
    );
    expect((thrown as ConfigurationError).details).toContain(
      "Rollback failure (restore secret api-key): simulated secret restore failure",
    );
  });

  test("renames profile config, active selection, and secrets", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });
    setActiveProfile("staging");

    renameProfile("staging", "acme_staging");

    expect(profileExists("staging")).toBe(false);
    expect(profileExists("acme_staging")).toBe(true);
    expect(getActiveProfileName()).toBe("acme_staging");
    expect(secretGet("api-key", "acme_staging")).toBe("atm_staging");
    expect(secretGet("api-key", "staging")).toBe("");
  });

  test("rolls back profile config and Keychain secrets after a rename failure", () => {
    createEmptyProfile("staging");
    process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
    const keychain = createFakeKeychain();
    keychain.store.secretSet("api-key", "atm_staging", "staging");
    keychain.store.secretSet("lakehouse/password", "lakehouse-secret", "staging");
    keychain.failingWrites.add("profile/acme_staging/lakehouse/password");

    expect(() => renameProfile("staging", "acme_staging", keychain.store)).toThrow(
      "Failed to store secret in macOS keychain",
    );

    expect(profileExists("staging")).toBe(true);
    expect(profileExists("acme_staging")).toBe(false);
    expect(keychain.store.secretGet("api-key", "staging")).toBe("atm_staging");
    expect(keychain.store.secretGet("lakehouse/password", "staging")).toBe("lakehouse-secret");
    expect(keychain.store.secretGet("api-key", "acme_staging")).toBe("");
  });

  test("rolls back config and secrets when switching the renamed active profile fails", () => {
    createEmptyProfile("staging");
    setActiveProfile("staging");
    const keychain = createFakeKeychain();
    keychain.store.secretSet("api-key", "atm_staging", "staging");

    expect(() =>
      renameProfile("staging", "acme_staging", keychain.store, {
        renameDirectory(source, target) {
          renameSync(profileDir(source), profileDir(target));
        },
        removeDirectory(name) {
          rmSync(profileDir(name), { recursive: true, force: true });
        },
        setActive(name) {
          if (name === "acme_staging") {
            throw new Error("simulated active-profile failure");
          }
          setActiveProfile(name);
        },
      }),
    ).toThrow("simulated active-profile failure");

    expect(profileExists("staging")).toBe(true);
    expect(profileExists("acme_staging")).toBe(false);
    expect(getActiveProfileName()).toBe("staging");
    expect(keychain.store.secretGet("api-key", "staging")).toBe("atm_staging");
    expect(keychain.store.secretGet("api-key", "acme_staging")).toBe("");
  });

  test("reports incomplete recovery after profile rename fails", () => {
    createEmptyProfile("staging");
    setActiveProfile("staging");
    const keychain = createFakeKeychain();

    let thrown: unknown;
    try {
      renameProfile("staging", "acme_staging", keychain.store, {
        renameDirectory(source, target) {
          renameSync(profileDir(source), profileDir(target));
        },
        removeDirectory(name) {
          rmSync(profileDir(name), { recursive: true, force: true });
        },
        setActive(name) {
          throw new Error(
            name === "acme_staging"
              ? "simulated rename completion failure"
              : "simulated active restore failure",
          );
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigurationError);
    expect((thrown as ConfigurationError).message).toContain("rollback was incomplete");
    expect(((thrown as ConfigurationError).cause as Error).message).toBe(
      "simulated rename completion failure",
    );
    expect((thrown as ConfigurationError).details).toContain(
      "Rollback failure (restore active profile): simulated active restore failure",
    );
  });

  test("rejects a no-op rename when the source profile does not exist", () => {
    expect(() => renameProfile("missing", "missing")).toThrow("Profile not found: missing");
  });
});
