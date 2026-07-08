const COMMAND_PATTERN = /altertable(?:\s+[^\s'",]+)*/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g;
const URL_PATTERN = /https?:\/\/[^\s)>\]]+/g;
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

type TerminalStyle =
  | "strong"
  | "underline"
  | "accent"
  | "string"
  | "boolean"
  | "number"
  | "muted"
  | "subtle"
  | "success"
  | "warning"
  | "error";

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

export type TerminalDataType = "null" | "boolean" | "number" | "string" | "uuid" | "timestamp";

let contextColorMode: TerminalColorMode | undefined;
let noColorEnvSetByCli = false;

export function setTerminalColorMode(mode: TerminalColorMode | undefined): void {
  contextColorMode = mode;
}

export function applyTerminalColorFromContext(context: { noColor?: boolean }): void {
  if (context.noColor) {
    setTerminalColorMode("never");
    process.env.NO_COLOR = "1";
    noColorEnvSetByCli = true;
    return;
  }
  setTerminalColorMode(undefined);
  if (noColorEnvSetByCli) {
    delete process.env.NO_COLOR;
    noColorEnvSetByCli = false;
  }
}

export function ensurePromptColorAlignment(): void {
  if (!shouldUseTerminalColor()) {
    process.env.NO_COLOR = "1";
  }
}

function readEnvColorMode(): TerminalColorMode | undefined {
  const env = globalThis.process?.env ?? {};
  const value = env.ALTERTABLE_COLOR?.trim().toLowerCase();
  if (value === "always" || value === "never" || value === "auto") {
    return value;
  }
  return undefined;
}

function resolveTerminalColorMode(): TerminalColorMode {
  if (contextColorMode !== undefined) {
    return contextColorMode;
  }
  const envMode = readEnvColorMode();
  if (envMode !== undefined) {
    return envMode;
  }
  const env = globalThis.process?.env ?? {};
  if (env.NO_COLOR === "1" || env.FORCE_COLOR === "0") {
    return "never";
  }
  if (env.FORCE_COLOR === "1" || env.FORCE_COLOR === "2" || env.FORCE_COLOR === "3") {
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
  const env = globalThis.process?.env ?? {};
  if (env.TERM === "dumb" || Boolean(env.TEST) || Boolean(env.CI)) {
    return false;
  }
  return isInteractiveTerminal();
}

export function shouldUseTerminalHyperlinks(): boolean {
  if (!shouldUseTerminalColor()) {
    return false;
  }
  const env = globalThis.process?.env ?? {};
  const override = env.OSC_HYPERLINK?.trim().toLowerCase();
  if (override === "0" || override === "false") {
    return false;
  }
  if (override === "1" || override === "true") {
    return true;
  }
  if (env.SSH_CONNECTION && env.TERM_PROGRAM !== "Apple_Terminal") {
    return false;
  }
  const termProgram = env.TERM_PROGRAM;
  if (
    termProgram === "iTerm.app" ||
    termProgram === "Apple_Terminal" ||
    termProgram === "ghostty" ||
    termProgram === "WezTerm" ||
    termProgram === "vscode"
  ) {
    return true;
  }
  if (env.WT_SESSION || env.GHOSTTY_RESOURCES_DIR) {
    return true;
  }
  return isInteractiveTerminal();
}

function getCodePointDisplayWidth(codePoint: number): number {
  if (codePoint === 0xfe0f) {
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

function getPlainTextDisplayWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    width += getCodePointDisplayWidth(codePoint);
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

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    const charWidth = getCodePointDisplayWidth(codePoint);
    if (visibleWidth + charWidth > targetWidth) {
      break;
    }

    if (codePoint > 0xffff) {
      result += String.fromCodePoint(codePoint);
      index += 1;
    } else {
      result += character;
    }
    visibleWidth += charWidth;
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

export function terminalStrong(text: string): string {
  return applyTerminalStyle("strong", text);
}

export function terminalAccent(text: string): string {
  return applyTerminalStyle("accent", text);
}

export function terminalString(text: string): string {
  return applyTerminalStyle("string", text);
}

export function terminalBoolean(text: string): string {
  return applyTerminalStyle("boolean", text);
}

export function terminalNumber(text: string): string {
  return applyTerminalStyle("number", text);
}

export function terminalHttpMethod(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return terminalSuccess(method.toUpperCase());
    case "POST":
      return terminalAccent(method.toUpperCase());
    case "PATCH":
      return terminalWarning(method.toUpperCase());
    case "PUT":
      return terminalString(method.toUpperCase());
    case "DELETE":
      return terminalError(method.toUpperCase());
    default:
      return terminalSubtle(method.toUpperCase());
  }
}

export function terminalLink(label: string, url: string): string {
  if (!shouldUseTerminalHyperlinks()) {
    return label;
  }
  return `${OSC_HYPERLINK_START}${url}${OSC_HYPERLINK_SEPARATOR}${label}${OSC_HYPERLINK_END}`;
}

export function terminalUrl(url: string): string {
  const styled = terminalAccent(url);
  if (!shouldUseTerminalHyperlinks()) {
    return styled;
  }
  return terminalLink(styled, url);
}

export function formatTerminalUrls(text: string): string {
  if (!shouldUseTerminalColor()) {
    return text;
  }
  return text.replace(URL_PATTERN, (url) => terminalUrl(url));
}

export function formatTerminalMarkdownLinks(text: string): string {
  return text.replace(MARKDOWN_LINK_PATTERN, (_match, label: string, url: string) => {
    if (!shouldUseTerminalColor()) {
      return `${label} (${url})`;
    }
    if (!shouldUseTerminalHyperlinks()) {
      return `${terminalAccent(label)} ${terminalSubtle(`(${url})`)}`;
    }
    return terminalLink(terminalAccent(label), url);
  });
}

export function terminalDataType(text: string, kind: TerminalDataType): string {
  switch (kind) {
    case "null":
      return terminalSubtle(text);
    case "boolean":
      return terminalBoolean(text);
    case "number":
      return terminalNumber(text);
    case "string":
      return terminalString(text);
    case "uuid":
      return terminalAccent(text);
    case "timestamp":
      return terminalString(text);
  }
}

export function terminalTimestamp(absolute: string, relative: string | null): string {
  const styledAbsolute = terminalString(absolute);
  if (relative === null) {
    return styledAbsolute;
  }
  return `${styledAbsolute} ${terminalSubtle(relative)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isUuidValue(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isTimestampValue(value: string): boolean {
  return TIMESTAMP_PATTERN.test(value);
}

export function classifyStringDataType(value: string): TerminalDataType {
  if (isUuidValue(value)) {
    return "uuid";
  }
  if (isTimestampValue(value)) {
    return "timestamp";
  }
  return "string";
}

export function parseJsonStringValue(value: string): string | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

export function terminalSuccess(text: string): string {
  return applyTerminalStyle("success", text);
}

export function terminalWarning(text: string): string {
  return applyTerminalStyle("warning", text);
}

export function terminalError(text: string): string {
  return applyTerminalStyle("error", text);
}

export function terminalUnderline(text: string): string {
  return applyTerminalStyle("underline", text);
}

export function terminalSectionHeader(title: string): string {
  return terminalUnderline(terminalStrong(title.toUpperCase()));
}

export function formatTerminalSection(bodyLines: string[]): string {
  return bodyLines.join("\n");
}

export function terminalLabel(text: string): string {
  return terminalMuted(text);
}

export function terminalTableHeader(title: string): string {
  return terminalSubtle(title.toUpperCase());
}

export function terminalDefaultHint(value: string): string {
  return terminalSubtle(`[${value}]`);
}

export function terminalNotConfiguredStatus(): string {
  return terminalMuted("not set");
}

export function terminalDescription(text: string): string {
  return terminalSubtle(text);
}

export function terminalSubtle(text: string): string {
  return applyTerminalStyle("subtle", text);
}

export function terminalMuted(text: string): string {
  return applyTerminalStyle("muted", text);
}

export function terminalMetadata(text: string): string {
  return terminalSubtle(text);
}

export function formatTerminalLabelValue(
  label: string,
  value: string,
  options: { indent?: string; labelWidth?: number; linkifyUrls?: boolean } = {},
): string {
  const indent = options.indent ?? "";
  const labelWidth = options.labelWidth ?? label.length;
  const displayValue = options.linkifyUrls ? formatTerminalUrls(value) : value;
  return `${indent}${terminalLabel(`${label.padEnd(labelWidth)}`)} ${displayValue}`;
}

export function terminalHighlightCommands(text: string): string {
  if (!shouldUseTerminalColor()) {
    return text;
  }
  return text.replace(COMMAND_PATTERN, (match) => terminalAccent(match));
}

export function terminalUsageSectionHeader(title: string): string {
  return applyTerminalStyle("strong", applyTerminalStyle("underline", title));
}

export function formatTerminalUsageSection(title: string, bodyLines: string[]): string {
  if (bodyLines.length === 0) {
    return "";
  }

  return `\n\n${terminalUsageSectionHeader(title)}\n\n${bodyLines.join("\n")}`;
}

export function formatCommandExamplesSection(examples: readonly string[]): string {
  if (examples.length === 0) {
    return "";
  }

  const bodyLines = examples.map((example) => `  ${terminalHighlightCommands(example)}`);
  return formatTerminalUsageSection("EXAMPLES", bodyLines);
}
