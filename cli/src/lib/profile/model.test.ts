import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setCliContext } from "@/context.ts";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import {
  createEmptyProfile,
  deleteProfile,
  deriveProfileName,
  inspectProfile,
  listProfiles,
  renameProfile,
  updateProfile,
} from "@/lib/profile/model.ts";
import { getActiveProfileName, profileExists, setActiveProfile } from "@/lib/profile-store.ts";
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
    process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
    createEmptyProfile("staging");
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
    process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
    createEmptyProfile("staging");
    const keychain = createFakeKeychain();
    keychain.store.secretSet("api-key", "atm_staging", "staging");
    keychain.failingDeletes.add("profile/staging/api-key");

    expect(() => deleteProfile("staging", keychain.store)).toThrow(
      "Failed to delete secret from macOS keychain",
    );

    expect(profileExists("staging")).toBe(true);
    expect(keychain.store.secretGet("api-key", "staging")).toBe("atm_staging");
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
    process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
    createEmptyProfile("staging");
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
});
