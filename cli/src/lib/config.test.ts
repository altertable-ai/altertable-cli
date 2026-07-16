import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configDir,
  configGet,
  configSet,
  configSetGlobal,
  getQueryDefaultLayout,
  getQueryDefaultMaxColumnWidth,
  getQueryDefaultPager,
  kvGet,
  kvSet,
  resolveApiBase,
  resolveManagementApiBase,
} from "@/lib/config.ts";
import { profileConfigFile } from "@/lib/profile-store.ts";

let testHome = "";
const profileName = "default";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-config-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_ALLOW_INSECURE_HTTP;
});

describe("config", () => {
  test("stores key-value config in protected files", () => {
    const filePath = join(testHome, "sample");

    kvSet(filePath, "user", "alice");
    kvSet(filePath, "user", "bob");

    expect(kvGet(filePath, "user")).toBe("bob");
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
    expect(configGet("missing", profileName)).toBe("");
  });

  test("resolves API bases from defaults, stored config, and environment overrides", () => {
    expect(resolveApiBase(profileName)).toBe("https://api.altertable.ai");
    expect(resolveManagementApiBase(profileName)).toBe("https://app.altertable.ai/rest/v1");

    configSet("api_base", "http://localhost:1111/", profileName);
    configSet("management_api_base", "http://localhost:13000/", profileName);
    expect(resolveApiBase(profileName)).toBe("http://localhost:1111");
    expect(resolveManagementApiBase(profileName)).toBe("http://localhost:13000/rest/v1");

    process.env.ALTERTABLE_API_BASE = "http://localhost:2222";
    expect(resolveApiBase(profileName)).toBe("http://localhost:2222");
  });

  test("requires an opt-in for insecure non-local API bases", () => {
    process.env.ALTERTABLE_API_BASE = "http://192.168.1.5";
    expect(() => resolveApiBase(profileName)).toThrow("Insecure HTTP URL");

    process.env.ALTERTABLE_ALLOW_INSECURE_HTTP = "true";
    expect(resolveApiBase(profileName)).toBe("http://192.168.1.5");
  });

  test("reads valid query display defaults and ignores invalid values", () => {
    configSetGlobal("query_max_width", "48");
    configSetGlobal("query_layout", "line");
    configSetGlobal("query_pager", "always");
    expect(getQueryDefaultMaxColumnWidth()).toBe(48);
    expect(getQueryDefaultLayout()).toBe("line");
    expect(getQueryDefaultPager()).toBe("always");

    configSetGlobal("query_max_width", "4");
    configSetGlobal("query_layout", "invalid");
    configSetGlobal("query_pager", "sometimes");
    expect(getQueryDefaultMaxColumnWidth()).toBeUndefined();
    expect(getQueryDefaultLayout()).toBeUndefined();
    expect(getQueryDefaultPager()).toBeUndefined();
  });

  test("keeps global query defaults outside profile config", () => {
    configSetGlobal("query_layout", "line");
    configSet("api_key_env", "staging", "staging");

    expect(kvGet(join(testHome, "config"), "query_layout")).toBe("line");
    expect(kvGet(profileConfigFile("staging"), "query_layout")).toBe("");
  });

  test("uses ALTERTABLE_CONFIG_HOME for profile config", () => {
    expect(configDir()).toBe(testHome);
    configSet("user", "x", profileName);

    const configFile = join(testHome, "profiles", "default", "config");
    expect(existsSync(configFile)).toBe(true);
    expect(readFileSync(configFile, "utf8")).toContain("user=x");
  });
});
