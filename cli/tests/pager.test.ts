import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configSet } from "@/lib/config.ts";
import { buildPagerEnv, resolvePagerOptions, shouldUsePager } from "@/lib/pager.ts";

describe("resolvePagerOptions", () => {
  let testHome = "";

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "altertable-pager-test-"));
    process.env.ALTERTABLE_CONFIG_HOME = testHome;
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
    delete process.env.ALTERTABLE_CONFIG_HOME;
  });

  test("config always forces pager when CLI flags unset", () => {
    configSet("query_pager", "always");
    expect(resolvePagerOptions()).toEqual({ mode: "always" });
  });

  test("CLI pager mode wins over config always", () => {
    configSet("query_pager", "always");
    expect(resolvePagerOptions("never")).toEqual({ mode: "never" });
  });

  test("config always triggers pager for short text on TTY", () => {
    configSet("query_pager", "always");
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    expect(shouldUsePager("short", resolvePagerOptions())).toBe(true);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });
});

describe("buildPagerEnv", () => {
  test("defaults less to UTF-8 so box drawing characters render correctly", () => {
    expect(buildPagerEnv({ PATH: "/bin" })).toMatchObject({
      LESS: "FRX",
      LESSCHARSET: "utf-8",
      PATH: "/bin",
    });
  });

  test("preserves explicit LESSCHARSET overrides", () => {
    expect(buildPagerEnv({ LESSCHARSET: "latin1" }).LESSCHARSET).toBe("latin1");
  });
});

describe("shouldUsePager", () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalRows = process.stdout.rows;
  const originalColumns = process.stdout.columns;

  test("returns false when disabled", () => {
    expect(shouldUsePager("line1\nline2\nline3", { mode: "never" })).toBe(false);
  });

  test("returns false when stdout is not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    expect(shouldUsePager("line1\nline2\nline3", { mode: "always" })).toBe(false);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  test("returns true when forced on TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: 24, configurable: true });
    expect(shouldUsePager("short", { mode: "always" })).toBe(true);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: originalRows, configurable: true });
  });

  test("returns true when output exceeds terminal rows", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: 3, configurable: true });
    const text = "line1\nline2\nline3\nline4";
    expect(shouldUsePager(text, { mode: "auto" })).toBe(true);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: originalRows, configurable: true });
  });

  test("returns true when output exceeds terminal columns", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: 10, configurable: true });
    expect(shouldUsePager("short\nthis line is too wide", { mode: "auto" })).toBe(true);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "columns", {
      value: originalColumns,
      configurable: true,
    });
  });

  test("returns false when output fits terminal", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: 24, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: 80, configurable: true });
    expect(shouldUsePager("line1\nline2", { mode: "auto" })).toBe(false);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: originalRows, configurable: true });
    Object.defineProperty(process.stdout, "columns", {
      value: originalColumns,
      configurable: true,
    });
  });
});
