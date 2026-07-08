export const TERMINAL_INDENT = "  ";
export const TERMINAL_LABEL_WIDTH = 17;
export const TERMINAL_NESTED_LABEL_WIDTH = 14;

export function nestedIndent(indent: string = TERMINAL_INDENT): string {
  return `${indent}${TERMINAL_INDENT}`;
}

export function padLeft(lines: readonly string[], padding: string = TERMINAL_INDENT): string[] {
  return lines.flatMap((line) => line.split("\n").map((segment) => `${padding}${segment}`));
}
