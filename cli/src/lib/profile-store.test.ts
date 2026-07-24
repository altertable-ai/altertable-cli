import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kvGet } from "@/lib/config.ts";
import {
  DEFAULT_PROFILE_NAME,
  ensureProfileExists,
  ensureProfilesLayout,
  FROM_ENV_PSEUDOPROFILE_NAME,
  getActiveProfileName,
  getProfileId,
  profileConfigFile,
  profileExists,
  resolveWorkingProfile,
  resolveProfileReference,
  setActiveProfile,
} from "@/lib/profile-store.ts";
import { kvSet } from "@/lib/config.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-profile-store-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_PROFILE;
  delete process.env.ALTERTABLE_API_KEY;
});

describe("profile store", () => {
  test("creates the default profile layout and active selection", () => {
    ensureProfilesLayout();

    expect(existsSync(profileConfigFile(DEFAULT_PROFILE_NAME))).toBe(true);
    expect(getProfileId(DEFAULT_PROFILE_NAME)).toMatch(/^[0-9a-f-]{36}$/);
    expect(existsSync(join(testHome, "profiles", DEFAULT_PROFILE_NAME))).toBe(true);
    expect(kvGet(join(testHome, "config"), "active_profile")).toBe(DEFAULT_PROFILE_NAME);
  });

  test("resolves an explicit override before the environment and active profile", () => {
    ensureProfileExists("staging");
    ensureProfileExists("production");
    setActiveProfile("production");
    process.env.ALTERTABLE_PROFILE = "staging";

    expect(resolveWorkingProfile("production")).toBe("production");
    expect(resolveWorkingProfile()).toBe("staging");

    delete process.env.ALTERTABLE_PROFILE;
    expect(resolveWorkingProfile()).toBe("production");
    expect(getActiveProfileName()).toBe("production");
  });

  test("rejects unsafe names and accepts supported profile names", () => {
    expect(() => resolveWorkingProfile("../../outside")).toThrow("Invalid profile name");
    expect(() => setActiveProfile("..")).toThrow("Invalid profile name");

    ensureProfileExists("staging");
    ensureProfileExists("prod-eu");
    expect(profileExists("staging")).toBe(true);
    expect(profileExists("prod-eu")).toBe(true);
  });

  test("preserves a stale active profile reference for read-only diagnostics", () => {
    kvSet(join(testHome, "config"), "active_profile", "missing");

    expect(resolveProfileReference()).toBe("missing");
  });

  test("resolves the env pseudo-profile while environment configuration is active", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";

    expect(resolveWorkingProfile()).toBe(FROM_ENV_PSEUDOPROFILE_NAME);
    expect(resolveProfileReference()).toBe(FROM_ENV_PSEUDOPROFILE_NAME);
  });

  test("rejects --profile while environment configuration is active", () => {
    ensureProfileExists("production");
    process.env.ALTERTABLE_API_KEY = "atm_env";

    expect(() => resolveWorkingProfile("production")).toThrow(
      'Cannot select profile "production" through --profile: environment configuration is active, so stored profiles are ignored.',
    );
    expect(() => resolveProfileReference("production")).toThrow(
      'Cannot select profile "production" through --profile',
    );
  });

  test("rejects ALTERTABLE_PROFILE while environment configuration is active", () => {
    ensureProfileExists("staging");
    process.env.ALTERTABLE_PROFILE = "staging";
    process.env.ALTERTABLE_API_KEY = "atm_env";

    expect(() => resolveWorkingProfile()).toThrow(
      'Cannot select profile "staging" through ALTERTABLE_PROFILE',
    );
    expect(() => resolveWorkingProfile()).toThrow("ALTERTABLE_API_KEY");
  });
});
