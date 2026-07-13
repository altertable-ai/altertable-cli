import { readEnv, setEnv, unsetEnv } from "@/lib/env.ts";

const COMMAND_PATTERN = /altertable(?:\s+[^\s'",]+)*/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g;
const URL_PATTERN = /https?:\/\/[^\s)>\]]+/g;
import type { DisplayText, DisplayTextStyle } from "@/ui/document.ts";
export const DEFAULT_TERMINAL_WIDTH = 80;
const TERMINAL_ELLIPSIS = "…";
const ANSI_ESCAPE_CHARACTER = String.fromCharCode(27);
const ANSI_RESET = "\u001b[0m";
const ANSI_ESCAPE_PATTERN = new RegExp(`${ANSI_ESCAPE_CHARACTER}\\[[0-9;]*m`, "g");
const OSC_HYPERLINK_START = "\u001b]8;;";
const OSC_HYPERLINK_SEPARATOR = "\u0007";
const OSC_HYPERLINK_END = "\u001b]8;;\u0007";
const OSC_HYPERLINK_PATTERN = new RegExp(`${ANSI_ESCAPE_CHARACTER}\\]8;;[^\\u0007]*\\u0007`, "g");
const TERMINAL_CONTROL_PATTERN = new RegExp(
  `${ANSI_ESCAPE_CHARACTER}\\[[0-9;]*m|${ANSI_ESCAPE_CHARACTER}\\]8;;[^\\u0007]*\\u0007`,
  "g",
);

type TerminalStyle = Exclude<DisplayTextStyle, "heading" | "httpMethod"> | "underline";

const STYLE_CODES: Record<TerminalStyle, { open: number; close: number }> = {
  strong: { open: 1, close: 22 },
  underline: { open: 4, close: 24 },
  accent: { open: 96, close: 39 },
  string: { open: 34, close: 39 },
  boolean: { open: 35, close: 39 },
  number: { open: 33, close: 39 },
  muted: { open: 2, close: 22 },
  subtle: { open: 90, close: 39 },
  success: { open: 32, close: 39 },
  warning: { open: 93, close: 39 },
  error: { open: 31, close: 39 },
};

export type TerminalColorMode = "auto" | "always" | "never";

let contextColorMode: TerminalColorMode | undefined;
let noColorEnvSetByCli = false;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function setTerminalColorMode(mode: TerminalColorMode | undefined): void {
  contextColorMode = mode;
}

export function applyTerminalColorFromContext(context: { noColor?: boolean }): void {
  if (context.noColor) {
    setTerminalColorMode("never");
    setEnv("NO_COLOR", "1");
    noColorEnvSetByCli = true;
    return;
  }
  setTerminalColorMode(undefined);
  if (noColorEnvSetByCli) {
    unsetEnv("NO_COLOR");
    noColorEnvSetByCli = false;
  }
}

export function ensurePromptColorAlignment(): void {
  if (!shouldUseTerminalColor()) {
    setEnv("NO_COLOR", "1");
  }
}

function readEnvColorMode(): TerminalColorMode | undefined {
  try {
    return readEnv("ALTERTABLE_COLOR");
  } catch {
    // Error rendering must remain available while startup validation reports
    // an invalid ALTERTABLE_COLOR value.
    return undefined;
  }
}

function resolveTerminalColorMode(): TerminalColorMode {
  if (contextColorMode !== undefined) {
    return contextColorMode;
  }
  const envMode = readEnvColorMode();
  if (envMode !== undefined) {
    return envMode;
  }
  const noColor = readEnv("NO_COLOR");
  const forceColor = readEnv("FORCE_COLOR");
  if (noColor === "1" || forceColor === "0") {
    return "never";
  }
  if (forceColor === "1" || forceColor === "2" || forceColor === "3") {
    return "always";
  }
  return "auto";
}

function isInteractiveTerminal(): boolean {
  return process.stdout?.isTTY === true || process.stderr?.isTTY === true;
}

export function shouldUseTerminalColor(): boolean {
  const mode = resolveTerminalColorMode();
  if (mode === "never") {
    return false;
  }
  if (mode === "always") {
    return true;
  }
  if (readEnv("TERM") === "dumb" || Boolean(readEnv("TEST")) || Boolean(readEnv("CI"))) {
    return false;
  }
  return isInteractiveTerminal();
}

export function shouldUseTerminalHyperlinks(): boolean {
  if (!shouldUseTerminalColor()) {
    return false;
  }
  const override = readEnv("OSC_HYPERLINK");
  if (override === "0" || override === "false") {
    return false;
  }
  if (override === "1" || override === "true") {
    return true;
  }
  const termProgram = readEnv("TERM_PROGRAM");
  if (readEnv("SSH_CONNECTION") && termProgram !== "Apple_Terminal") {
    return false;
  }
  if (
    termProgram === "iTerm.app" ||
    termProgram === "Apple_Terminal" ||
    termProgram === "ghostty" ||
    termProgram === "WezTerm" ||
    termProgram === "vscode"
  ) {
    return true;
  }
  if (readEnv("WT_SESSION") || readEnv("GHOSTTY_RESOURCES_DIR")) {
    return true;
  }
  return isInteractiveTerminal();
}

function getCodePointDisplayWidth(codePoint: number): number {
  if (
    codePoint === 0x200d ||
    codePoint === 0xfe0e ||
    codePoint === 0xfe0f ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
  ) {
    return 0;
  }
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3ffff)
  ) {
    return 2;
  }
  return 1;
}

function getGraphemeDisplayWidth(grapheme: string): number {
  let width = grapheme.includes("\ufe0f") ? 2 : 0;
  let regionalIndicatorCount = 0;
  for (const character of grapheme) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      width = Math.max(width, getCodePointDisplayWidth(codePoint));
      if (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) {
        regionalIndicatorCount += 1;
      }
    }
  }
  if (regionalIndicatorCount === 2) {
    return 2;
  }
  return width;
}

function getPlainTextDisplayWidth(text: string): number {
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(text)) {
    width += getGraphemeDisplayWidth(segment);
  }
  return width;
}

export function getTerminalWidth(): number {
  return globalThis.process?.stdout?.columns ?? DEFAULT_TERMINAL_WIDTH;
}

export function getVisibleTextWidth(text: string): number {
  return getPlainTextDisplayWidth(text.replace(TERMINAL_CONTROL_PATTERN, ""));
}

export type TerminalTextAlignment = "left" | "right" | "center";

export function padVisibleText(
  text: string,
  width: number,
  alignment: TerminalTextAlignment = "left",
): string {
  const paddingWidth = Math.max(0, width - getVisibleTextWidth(text));
  if (paddingWidth === 0) {
    return text;
  }
  if (alignment === "right") {
    return `${" ".repeat(paddingWidth)}${text}`;
  }
  if (alignment === "center") {
    const leftPadding = Math.floor(paddingWidth / 2);
    const rightPadding = paddingWidth - leftPadding;
    return `${" ".repeat(leftPadding)}${text}${" ".repeat(rightPadding)}`;
  }
  return `${text}${" ".repeat(paddingWidth)}`;
}

export function truncateTerminalText(text: string, maxWidth?: number): string {
  if (maxWidth === undefined || getVisibleTextWidth(text) <= maxWidth) {
    return text;
  }
  if (maxWidth <= 1) {
    return TERMINAL_ELLIPSIS;
  }

  const targetWidth = maxWidth - TERMINAL_ELLIPSIS.length;
  let visibleWidth = 0;
  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === ANSI_ESCAPE_CHARACTER && text[index + 1] === "[") {
      const closeIndex = text.indexOf("m", index + 2);
      if (closeIndex === -1) {
        break;
      }
      result += text.slice(index, closeIndex + 1);
      index = closeIndex;
      continue;
    }
    if (character === ANSI_ESCAPE_CHARACTER && text[index + 1] === "]") {
      const closeIndex = text.indexOf(OSC_HYPERLINK_SEPARATOR, index + 2);
      if (closeIndex === -1) {
        break;
      }
      result += text.slice(index, closeIndex + 1);
      index = closeIndex;
      continue;
    }

    const grapheme = graphemeSegmenter.segment(text.slice(index))[Symbol.iterator]().next()
      .value?.segment;
    if (grapheme === undefined) {
      break;
    }
    const graphemeWidth = getGraphemeDisplayWidth(grapheme);
    if (visibleWidth + graphemeWidth > targetWidth) {
      break;
    }
    result += grapheme;
    index += grapheme.length - 1;
    visibleWidth += graphemeWidth;
  }

  const closeOpenStyle = ANSI_ESCAPE_PATTERN.test(result) ? ANSI_RESET : "";
  ANSI_ESCAPE_PATTERN.lastIndex = 0;
  const closeOpenLink =
    (result.match(OSC_HYPERLINK_PATTERN)?.length ?? 0) % 2 === 1 ? OSC_HYPERLINK_END : "";

  return result + TERMINAL_ELLIPSIS + closeOpenStyle + closeOpenLink;
}

function applyTerminalStyle(style: TerminalStyle, text: string): string {
  if (!shouldUseTerminalColor()) {
    return text;
  }
  const code = STYLE_CODES[style];
  return `\u001b[${code.open}m${text}\u001b[${code.close}m`;
}

function sanitizeTerminalText(text: string): string {
  let safe = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const unsafe =
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069);
    if (!unsafe) {
      safe += character;
    } else if (codePoint <= 0xff) {
      safe += `\\x${codePoint.toString(16).padStart(2, "0")}`;
    } else {
      safe += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }
  }
  return safe;
}

function safeHyperlinkTarget(href: string): string | null {
  if (sanitizeTerminalText(href) !== href) {
    return null;
  }
  try {
    const protocol = new URL(href).protocol;
    return protocol === "http:" || protocol === "https:" ? href : null;
  } catch {
    return null;
  }
}

function renderHttpMethod(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return applyTerminalStyle("success", method.toUpperCase());
    case "POST":
      return applyTerminalStyle("accent", method.toUpperCase());
    case "PATCH":
      return applyTerminalStyle("warning", method.toUpperCase());
    case "PUT":
      return applyTerminalStyle("string", method.toUpperCase());
    case "DELETE":
      return applyTerminalStyle("error", method.toUpperCase());
    default:
      return applyTerminalStyle("subtle", method.toUpperCase());
  }
}

function renderLink(label: string, url: string): string {
  if (!shouldUseTerminalHyperlinks()) {
    return label;
  }
  return `${OSC_HYPERLINK_START}${url}${OSC_HYPERLINK_SEPARATOR}${label}${OSC_HYPERLINK_END}`;
}

function renderHeading(text: string): string {
  return applyTerminalStyle("strong", applyTerminalStyle("underline", text.toUpperCase()));
}

const DISPLAY_TEXT_STYLE_RENDERERS = {
  strong: (text: string) => applyTerminalStyle("strong", text),
  accent: (text: string) => applyTerminalStyle("accent", text),
  string: (text: string) => applyTerminalStyle("string", text),
  boolean: (text: string) => applyTerminalStyle("boolean", text),
  number: (text: string) => applyTerminalStyle("number", text),
  muted: (text: string) => applyTerminalStyle("muted", text),
  subtle: (text: string) => applyTerminalStyle("subtle", text),
  success: (text: string) => applyTerminalStyle("success", text),
  warning: (text: string) => applyTerminalStyle("warning", text),
  error: (text: string) => applyTerminalStyle("error", text),
  heading: renderHeading,
  httpMethod: renderHttpMethod,
} satisfies Record<DisplayTextStyle, (text: string) => string>;

export function renderDisplayText(text: DisplayText): string {
  if (typeof text === "string") {
    return sanitizeTerminalText(text);
  }
  return text
    .map((item) => {
      const safeText = sanitizeTerminalText(item.text);
      const styled = item.style ? DISPLAY_TEXT_STYLE_RENDERERS[item.style](safeText) : safeText;
      if (!item.href) {
        return styled;
      }
      const safeHref = safeHyperlinkTarget(item.href);
      if (safeHref !== null && shouldUseTerminalHyperlinks()) {
        return renderLink(styled, safeHref);
      }
      const visibleHref = sanitizeTerminalText(item.href);
      return safeText === visibleHref
        ? styled
        : `${styled} ${applyTerminalStyle("subtle", `(${visibleHref})`)}`;
    })
    .join("");
}
