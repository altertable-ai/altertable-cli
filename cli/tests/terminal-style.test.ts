import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  classifyStringDataType,
  formatCommandExamplesSection,
  formatTerminalMarkdownLinks,
  formatTerminalLabelValue,
  formatTerminalSection,
  formatTerminalUrls,
  getVisibleTextWidth,
  isTimestampValue,
  isUuidValue,
  setTerminalColorMode,
  shouldUseTerminalColor,
  shouldUseTerminalHyperlinks,
  terminalAccent,
  terminalDataType,
  terminalDefaultHint,
  terminalError,
  terminalHighlightCommands,
  terminalHttpMethod,
  terminalLabel,
  terminalLink,
  terminalSectionHeader,
  terminalStrong,
  terminalSubtle,
  terminalSuccess,
  terminalTableHeader,
  terminalTimestamp,
  terminalUrl,
  terminalWarning,
  truncateTerminalText,
  applyTerminalColorFromContext,
} from "@/ui/terminal/styles.ts";
import { padLeft } from "@/ui/terminal/spacing.ts";

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
    expect(terminalAccent("altertable")).toBe("altertable");
    expect(terminalStrong("USAGE")).toBe("USAGE");
    expect(terminalSubtle("[default]")).toBe("[default]");
    expect(terminalSuccess("ok")).toBe("ok");
    expect(terminalWarning("careful")).toBe("careful");
    expect(terminalError("failed")).toBe("failed");
    expect(terminalSectionHeader("Options")).toBe("OPTIONS");
    expect(terminalDefaultHint("production")).toBe("[production]");
    expect(terminalTableHeader("method")).toBe("METHOD");
    expect(formatTerminalLabelValue("Path:", "/whoami")).toContain("Path:");
    expect(terminalHighlightCommands("run altertable context")).toContain("altertable context");
    expect(formatTerminalSection(["User: alice"])).toBe("User: alice");
    expect(terminalLabel("Config dir:")).toBe("Config dir:");
  });

  test("disables color when stdout and stderr are not TTY in auto mode", () => {
    delete process.env.NO_COLOR;
    delete process.env.TEST;
    delete process.env.CI;
    delete process.env.FORCE_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(shouldUseTerminalColor()).toBe(false);
    expect(terminalAccent("altertable")).toBe("altertable");
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
    expect(terminalAccent("configure")).toContain("\u001b[96mconfigure\u001b[39m");
    expect(terminalSuccess("ok")).toContain("\u001b[32mok\u001b[39m");
    expect(terminalWarning("careful")).toContain("\u001b[93mcareful\u001b[39m");
    expect(terminalError("failed")).toContain("\u001b[31mfailed\u001b[39m");
    expect(terminalSectionHeader("Usage")).toContain("USAGE");
    expect(terminalLabel("Active profile:")).toContain("\u001b[2mActive profile:\u001b[22m");
  });

  test("maps each data type to a dedicated color", () => {
    enableTerminalColorForTests();
    expect(terminalDataType("NULL", "null")).toContain("\u001b[90m");
    expect(terminalDataType("true", "boolean")).toContain("\u001b[35m");
    expect(terminalDataType("42", "number")).toContain("\u001b[33m");
    expect(terminalDataType("hello", "string")).toContain("\u001b[34m");
    expect(terminalDataType("019ee8e4-1d79-77d9-8693-1f67732b184d", "uuid")).toContain(
      "\u001b[96m",
    );
    expect(terminalDataType("2026-06-21T06:35:24.409Z", "timestamp")).toContain("\u001b[34m");
  });

  test("styles HTTP methods with semantic colors", () => {
    enableTerminalColorForTests();
    expect(terminalHttpMethod("GET")).toContain("\u001b[32m");
    expect(terminalHttpMethod("POST")).toContain("\u001b[96m");
    expect(terminalHttpMethod("PATCH")).toContain("\u001b[93m");
    expect(terminalHttpMethod("PUT")).toContain("\u001b[34m");
    expect(terminalHttpMethod("DELETE")).toContain("\u001b[31m");
  });

  test("styles timestamp absolute and relative parts with distinct contrast", () => {
    enableTerminalColorForTests();
    const output = terminalTimestamp("2026-06-21T06:35:24.409Z", "6 days ago");
    expect(output).toContain("\u001b[34m2026-06-21T06:35:24.409Z\u001b[39m");
    expect(output).toContain("\u001b[90m6 days ago\u001b[39m");
  });

  test("classifies string values by shape", () => {
    expect(isUuidValue("019ee8e4-1d79-77d9-8693-1f67732b184d")).toBe(true);
    expect(isTimestampValue("2026-06-21T06:35:24.409Z")).toBe(true);
    expect(classifyStringDataType("mcp_tool_call")).toBe("string");
    expect(classifyStringDataType("019ee8e4-1d79-77d9-8693-1f67732b184d")).toBe("uuid");
    expect(classifyStringDataType("2026-06-21T06:35:24.409Z")).toBe("timestamp");
  });

  test("truncateTerminalText respects visible width with ANSI codes", () => {
    enableTerminalColorForTests();
    const styled = terminalAccent("abcdefghijklmnopqrstuvwxyz");
    const truncated = truncateTerminalText(styled, 10);
    expect(truncated).toContain("…");
    expect(truncated).not.toContain("klmnopqrstuvwxyz");
    expect(getVisibleTextWidth(truncated)).toBeLessThanOrEqual(10);
  });

  test("truncateTerminalText keeps terminal hyperlinks non-printing", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "1";
    const linked = terminalLink("abcdefghijklmnopqrstuvwxyz", "https://example.com");
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

  test("linkifies URLs and emits OSC 8 hyperlinks when supported", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "1";
    const url = "https://api.altertable.ai";
    const linked = terminalUrl(url);
    expect(linked).toContain("\u001b]8;;https://api.altertable.ai\u0007");
    expect(linked).toContain("\u001b]8;;\u0007");
    expect(formatTerminalUrls(`Data plane: ${url}`)).toContain("\u001b]8;;");
  });

  test("terminalLink returns plain label when hyperlinks are disabled", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "0";
    expect(shouldUseTerminalHyperlinks()).toBe(false);
    expect(terminalLink("docs", "https://example.com")).toBe("docs");
  });

  test("formatTerminalMarkdownLinks renders clickable labeled links when supported", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "1";
    const output = formatTerminalMarkdownLinks("[Docs](https://example.com)");

    expect(output).toContain("\u001b]8;;https://example.com\u0007");
    expect(output).toContain("Docs");
    expect(output).not.toContain("[Docs]");
  });

  test("formatTerminalMarkdownLinks falls back to label and URL without color", () => {
    process.env.NO_COLOR = "1";
    expect(formatTerminalMarkdownLinks("[Docs](https://example.com)")).toBe(
      "Docs (https://example.com)",
    );
  });

  test("linkifyUrls option decorates configure label values", () => {
    enableTerminalColorForTests();
    process.env.OSC_HYPERLINK = "0";
    const line = formatTerminalLabelValue("Data plane:", "https://api.altertable.ai", {
      linkifyUrls: true,
    });
    expect(line).toContain("\u001b[96mhttps://api.altertable.ai\u001b[39m");
  });

  test("formatCommandExamplesSection renders EXAMPLES header", () => {
    enableTerminalColorForTests();
    const section = formatCommandExamplesSection(['altertable query --statement "SELECT 1"']);
    expect(section).toContain("EXAMPLES");
    expect(section).toContain("altertable query --statement");
  });
});
