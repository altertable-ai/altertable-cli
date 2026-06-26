import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { setCliContext } from "@/context.ts";
import {
  formatProgressStatus,
  formatUploadProgress,
  shouldShowProgress,
  startProgress,
} from "@/lib/progress.ts";

describe("shouldShowProgress", () => {
  const originalStderrIsTTY = process.stderr.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stderr, "isTTY", {
      value: originalStderrIsTTY,
      configurable: true,
    });
    setCliContext({ debug: false, json: false, agent: false });
  });

  test("returns false when json mode is enabled", () => {
    setCliContext({ debug: false, json: true, agent: false });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(shouldShowProgress()).toBe(false);
  });

  test("returns false when stderr is not a TTY", () => {
    setCliContext({ debug: false, json: false, agent: false });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(shouldShowProgress()).toBe(false);
  });
});

describe("formatUploadProgress", () => {
  test("shows percent for partial upload", () => {
    expect(formatUploadProgress(512, 1024)).toContain("50");
    expect(formatUploadProgress(512, 1024)).toContain("512/1024");
  });

  test("disabled when json mode is enabled", () => {
    setCliContext({ debug: false, json: true, agent: false });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(shouldShowProgress()).toBe(false);
  });
});

describe("formatProgressStatus", () => {
  test("formats semantic progress states", () => {
    expect(formatProgressStatus("active", "Working")).toBe("Working");
    expect(formatProgressStatus("success", "Done")).toContain("Done");
    expect(formatProgressStatus("error", "Failed")).toContain("Failed");
  });
});

describe("startProgress", () => {
  beforeEach(() => {
    setCliContext({ debug: false, json: true, agent: false });
  });

  test("no-op handle does not throw", () => {
    const handle = startProgress("Working");
    expect(() => handle.done()).not.toThrow();
    expect(() => handle.fail()).not.toThrow();
  });
});
