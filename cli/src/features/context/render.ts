import { buildActiveContext } from "@/features/context/model.ts";
import {
  buildActiveContextDetailsView,
  buildActiveContextSummaryView,
} from "@/features/context/views.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { renderDocument } from "@/ui/renderers/terminal.ts";
import { padLeft, TERMINAL_INDENT, TERMINAL_LABEL_WIDTH } from "@/ui/terminal/spacing.ts";
import { formatTerminalSection } from "@/ui/terminal/styles.ts";
import type { ActiveContext } from "@/features/context/model.ts";

export function formatActiveContextSummary(context: ActiveContext): string {
  const lines = renderDocument(buildActiveContextSummaryView(context).document);
  return `\n\n${formatTerminalSection(padLeft(lines))}`;
}

export function formatActiveContextDetails(context: ActiveContext): string {
  const lines = renderDocument(buildActiveContextDetailsView(context).document, {
    indent: TERMINAL_INDENT,
    labelWidth: TERMINAL_LABEL_WIDTH,
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
