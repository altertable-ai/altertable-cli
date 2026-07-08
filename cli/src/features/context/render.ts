import { buildActiveContext } from "@/features/context/model.ts";
import {
  buildActiveContextDetailsView,
  buildActiveContextSummaryView,
} from "@/features/context/views.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { renderDocument } from "@/ui/renderers/terminal.ts";
import { formatTerminalSection } from "@/ui/terminal/styles.ts";
import type { ActiveContext } from "@/features/context/model.ts";

const DETAIL_INDENT = "  ";
const DETAIL_LABEL_WIDTH = 17;

function indentSummaryLines(lines: string[]): string[] {
  return lines.flatMap((line) => line.split("\n").map((segment) => `${DETAIL_INDENT}${segment}`));
}

export function formatActiveContextSummary(context: ActiveContext): string {
  const lines = renderDocument(buildActiveContextSummaryView(context).document);
  return `\n\n${formatTerminalSection(indentSummaryLines(lines))}`;
}

export function formatActiveContextDetails(context: ActiveContext): string {
  const lines = renderDocument(buildActiveContextDetailsView(context).document, {
    indent: DETAIL_INDENT,
    labelWidth: DETAIL_LABEL_WIDTH,
  });
  return formatTerminalSection(lines);
}

export function tryFormatActiveContextSummary(profileOverride?: string): string {
  try {
    return formatActiveContextSummary(buildActiveContext(profileOverride));
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return "";
    }
    throw error;
  }
}
