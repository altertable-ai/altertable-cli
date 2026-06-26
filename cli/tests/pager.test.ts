import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configSet } from "@/lib/config.ts";
import { resolvePagerOptions, shouldUsePager } from "@/lib/pager.ts";

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
    expect(resolvePagerOptions({})).toEqual({ force: true });
  });

  test("CLI --no-pager wins over config always", () => {
    configSet("query_pager", "always");
    expect(resolvePagerOptions({ disable: true })).toEqual({ disable: true });
  });

  test("config always triggers pager for short text on TTY", () => {
    configSet("query_pager", "always");
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    expect(shouldUsePager("short", resolvePagerOptions({}))).toBe(true);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });
});

describe("shouldUsePager", () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalRows = process.stdout.rows;

  test("returns false when disabled", () => {
    expect(shouldUsePager("line1\nline2\nline3", { disable: true, force: true })).toBe(false);
  });

  test("returns false when stdout is not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    expect(shouldUsePager("line1\nline2\nline3", { force: true })).toBe(false);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  test("returns true when forced on TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: 24, configurable: true });
    expect(shouldUsePager("short", { force: true })).toBe(true);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: originalRows, configurable: true });
  });

  test("returns true when output exceeds terminal rows", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: 3, configurable: true });
    const text = "line1\nline2\nline3\nline4";
    expect(shouldUsePager(text, {})).toBe(true);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: originalRows, configurable: true });
  });

  test("returns false when output fits terminal", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: 24, configurable: true });
    expect(shouldUsePager("line1\nline2", {})).toBe(false);
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "rows", { value: originalRows, configurable: true });
  });
});
