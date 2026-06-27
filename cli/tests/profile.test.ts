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
  deleteProfile,
  ensureProfilesLayout,
  getActiveProfileName,
  listProfiles,
  profileConfigFile,
  profileExists,
  resolveProfileName,
  setActiveProfile,
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
