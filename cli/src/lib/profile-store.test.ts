import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kvGet } from "@/lib/config.ts";
import {
  DEFAULT_PROFILE_NAME,
  ensureProfileExists,
  ensureProfilesLayout,
  getActiveProfileName,
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
});

describe("profile store", () => {
  test("creates the default profile layout and active selection", () => {
    ensureProfilesLayout();

    expect(existsSync(profileConfigFile(DEFAULT_PROFILE_NAME))).toBe(false);
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
});
