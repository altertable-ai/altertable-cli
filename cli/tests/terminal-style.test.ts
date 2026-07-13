import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getVisibleTextWidth,
  setTerminalColorMode,
  shouldUseTerminalColor,
  truncateTerminalText,
  applyTerminalColorFromContext,
  renderDisplayText,
} from "@/ui/terminal/styles.ts";
import { padLeft } from "@/ui/terminal/spacing.ts";
import { span } from "@/ui/document.ts";

const originalNoColor = process.env.NO_COLOR;
const originalTerm = process.env.TERM;
const originalForceColor = process.env.FORCE_COLOR;
const originalAltertableColor = process.env.ALTERTABLE_COLOR;
const originalStdoutIsTTY = process.stdout.isTTY;
const originalStderrIsTTY = process.stderr.isTTY;

function enableTerminalColorForTests(): void {
  delete process.env.NO_COLOR;
  delete process.env.TEST;
  delete process.env.CI;
  delete process.env.FORCE_COLOR;
  delete process.env.ALTERTABLE_COLOR;
  process.env.TERM = "xterm-256color";
  setTerminalColorMode("always");
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
}

afterEach(() => {
  setTerminalColorMode(undefined);
  if (originalNoColor === undefined) {
    delete process.env.NO_COLOR;
  } else {
    process.env.NO_COLOR = originalNoColor;
  }
  if (originalTerm === undefined) {
    delete process.env.TERM;
  } else {
    process.env.TERM = originalTerm;
  }
  if (originalForceColor === undefined) {
    delete process.env.FORCE_COLOR;
  } else {
    process.env.FORCE_COLOR = originalForceColor;
  }
  if (originalAltertableColor === undefined) {
    delete process.env.ALTERTABLE_COLOR;
  } else {
    process.env.ALTERTABLE_COLOR = originalAltertableColor;
  }
  Object.defineProperty(process.stdout, "isTTY", {
    value: originalStdoutIsTTY,
    configurable: true,
  });
  Object.defineProperty(process.stderr, "isTTY", {
    value: originalStderrIsTTY,
    configurable: true,
  });
});

describe("terminal-style", () => {
  let savedTest: string | undefined;
  let savedCi: string | undefined;

  beforeEach(() => {
    savedTest = process.env.TEST;
    savedCi = process.env.CI;
    setTerminalColorMode(undefined);
  });

  afterEach(() => {
    if (savedTest === undefined) {
      delete process.env.TEST;
    } else {
      process.env.TEST = savedTest;
    }
    if (savedCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = savedCi;
    }
  });

  test("clears CLI-owned NO_COLOR when --no-color is removed from context", () => {
    enableTerminalColorForTests();
    applyTerminalColorFromContext({ noColor: true });
    expect(process.env.NO_COLOR).toBe("1");
    expect(shouldUseTerminalColor()).toBe(false);

    applyTerminalColorFromContext({ noColor: false });
    expect(process.env.NO_COLOR).toBeUndefined();
    expect(shouldUseTerminalColor()).toBe(true);
  });

  test("preserves user NO_COLOR when --no-color was never set", () => {
    process.env.NO_COLOR = "1";
    applyTerminalColorFromContext({ noColor: false });
    expect(process.env.NO_COLOR).toBe("1");
  });

  test("returns plain text when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    expect(
      renderDisplayText([
        span("altertable", "accent"),
        span(" USAGE", "strong"),
        span(" [default]", "subtle"),
        span(" ok", "success"),
        span(" careful", "warning"),
        span(" failed", "error"),
      ]),
    ).toBe("altertable USAGE [default] ok careful failed");
    expect(renderDisplayText([span("Options", "heading")])).toBe("OPTIONS");
  });

  test("disables color when stdout and stderr are not TTY in auto mode", () => {
    delete process.env.NO_COLOR;
    delete process.env.TEST;
    delete process.env.CI;
    delete process.env.FORCE_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(shouldUseTerminalColor()).toBe(false);
    expect(renderDisplayText([span("altertable", "accent")])).toBe("altertable");
  });

  test("enables color with FORCE_COLOR even when not a TTY", () => {
    delete process.env.NO_COLOR;
    delete process.env.TEST;
    delete process.env.CI;
    process.env.FORCE_COLOR = "1";
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(shouldUseTerminalColor()).toBe(true);
  });

  test("respects ALTERTABLE_COLOR=never", () => {
    enableTerminalColorForTests();
    process.env.ALTERTABLE_COLOR = "never";
    setTerminalColorMode(undefined);
    expect(shouldUseTerminalColor()).toBe(false);
  });

  test("wraps text with ANSI codes when color is enabled", () => {
    enableTerminalColorForTests();
    expect(renderDisplayText([span("configure", "accent")])).toContain(
      "\u001b[96mconfigure\u001b[39m",
    );
    expect(renderDisplayText([span("ok", "success")])).toContain("\u001b[32mok\u001b[39m");
    expect(renderDisplayText([span("careful", "warning")])).toContain(
      "\u001b[93mcareful\u001b[39m",
    );
    expect(renderDisplayText([span("failed", "error")])).toContain("\u001b[31mfailed\u001b[39m");
    expect(renderDisplayText([span("Usage", "heading")])).toContain("USAGE");
  });

  test("maps each data type to a dedicated color", () => {
    enableTerminalColorForTests();
    expect(renderDisplayText([span("NULL", "subtle")])).toContain("\u001b[90m");
    expect(renderDisplayText([span("true", "boolean")])).toContain("\u001b[35m");
    expect(renderDisplayText([span("42", "number")])).toContain("\u001b[33m");
    expect(renderDisplayText([span("hello", "string")])).toContain("\u001b[34m");
    expect(renderDisplayText([span("uuid", "accent")])).toContain("\u001b[96m");
  });

  test("styles HTTP methods with semantic colors", () => {
    enableTerminalColorForTests();
    expect(renderDisplayText([span("GET", "httpMethod")])).toContain("\u001b[32m");
    expect(renderDisplayText([span("POST", "httpMethod")])).toContain("\u001b[96m");
    expect(renderDisplayText([span("PATCH", "httpMethod")])).toContain("\u001b[93m");
    expect(renderDisplayText([span("PUT", "httpMethod")])).toContain("\u001b[34m");
    expect(renderDisplayText([span("DELETE", "httpMethod")])).toContain("\u001b[31m");
  });

  test("styles timestamp absolute and relative parts with distinct contrast", () => {
    enableTerminalColorForTests();
    const output = renderDisplayText([
      span("2026-06-21T06:35:24.409Z", "string"),
      span(" 6 days ago", "subtle"),
    ]);
    expect(output).toContain("\u001b[34m2026-06-21T06:35:24.409Z\u001b[39m");
    expect(output).toContain("\u001b[90m 6 days ago\u001b[39m");
  });

  test("truncateTerminalText respects visible width with ANSI codes", () => {
    enableTerminalColorForTests();
    const styled = renderDisplayText([span("abcdefghijklmnopqrstuvwxyz", "accent")]);
    const truncated = truncateTerminalText(styled, 10);
    expect(truncated).toContain("…");
    expect(truncated).not.toContain("klmnopqrstuvwxyz");
    expect(getVisibleTextWidth(truncated)).toBeLessThanOrEqual(10);
  });

  test("truncateTerminalText keeps terminal hyperlinks non-printing", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "1";
    const linked = renderDisplayText([
      span("abcdefghijklmnopqrstuvwxyz", "accent", "https://example.com"),
    ]);
    const truncated = truncateTerminalText(linked, 10);
    expect(truncated).toContain("\u001b]8;;https://example.com\u0007");
    expect(truncated).toContain("\u001b]8;;\u0007");
    expect(getVisibleTextWidth(truncated)).toBeLessThanOrEqual(10);
  });

  test("counts wide characters as double width", () => {
    expect(getVisibleTextWidth("日本語")).toBe(6);
    expect(getVisibleTextWidth("abc")).toBe(3);
  });

  test("padLeft indents multi-line terminal output", () => {
    expect(padLeft(["A\nB", "C"], "  ")).toEqual(["  A", "  B", "  C"]);
  });

  test("renders semantic links as OSC 8 hyperlinks when supported", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "1";
    const url = "https://api.altertable.ai";
    const linked = renderDisplayText([span(url, "accent", url)]);
    expect(linked).toContain("\u001b]8;;https://api.altertable.ai\u0007");
    expect(linked).toContain("\u001b]8;;\u0007");
  });

  test("renders styled presentation spans and links", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "0";
    const url = "https://api.altertable.ai";
    expect(renderDisplayText([span(url, "accent", url)])).toBe(
      "\u001b[96mhttps://api.altertable.ai\u001b[39m",
    );
    expect(renderDisplayText([span("Docs", "accent", "https://example.com")])).toContain(
      "Docs\u001b[39m \u001b[90m(https://example.com)",
    );
  });
});
