import {
  getTerminalWidth,
  getVisibleTextWidth,
  terminalAccent,
  terminalNotConfiguredStatus,
  terminalSubtle,
  truncateTerminalText,
} from "@/lib/terminal-style.ts";

const PLANE_STATUS_INDENT = "  ";
const PLANE_LABEL_WIDTH = 11;

export type ConfigurePlaneStatusOptions = {
  terminalWidth?: number;
};

export function formatConfigurePlaneStatusLine(
  plane: string,
  detail: string | null,
  options: ConfigurePlaneStatusOptions = {},
): string {
  const terminalWidth = options.terminalWidth ?? getTerminalWidth();
  const labelText = plane.padEnd(PLANE_LABEL_WIDTH);
  const styledLabel = terminalAccent(labelText);

  if (!detail) {
    return `${PLANE_STATUS_INDENT}${styledLabel}${terminalNotConfiguredStatus()}`;
  }

  const inlinePlain = `${PLANE_STATUS_INDENT}${labelText}${detail}`;
  if (getVisibleTextWidth(inlinePlain) <= terminalWidth) {
    return `${PLANE_STATUS_INDENT}${styledLabel}${terminalSubtle(detail)}`;
  }

  const availableDetailWidth = terminalWidth - getVisibleTextWidth(PLANE_STATUS_INDENT);
  const truncatedDetail = truncateTerminalText(detail, availableDetailWidth);
  return `${PLANE_STATUS_INDENT}${terminalAccent(plane)}\n${PLANE_STATUS_INDENT}${terminalSubtle(truncatedDetail)}`;
}
