import {
  buildActiveContextDetailsView,
  buildActiveContextSummaryView,
  buildProfileInspectView,
  buildProfileListView,
  buildProfileStatusView,
  configureAuthenticationRows,
  type ProfileStatusResult,
} from "@/features/profile/views.ts";
import {
  buildActiveContext,
  buildConfigureShowData,
  type ActiveContext,
  type ProfileInspect,
  type ProfileSummary,
} from "@/features/profile/model.ts";
import type { ConfigureAuthPlane } from "@/lib/profile-status.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { renderDocument, renderDocumentText, renderRows } from "@/ui/renderers/terminal.ts";
import {
  nestedIndent,
  padLeft,
  TERMINAL_INDENT,
  TERMINAL_LABEL_WIDTH,
  TERMINAL_NESTED_LABEL_WIDTH,
} from "@/ui/terminal/spacing.ts";
import { formatTerminalSection } from "@/ui/terminal/styles.ts";

export function formatProfileInspect(profile: ProfileInspect): string {
  return renderDocumentText(buildProfileInspectView(profile));
}

export function formatProfileStatus(result: ProfileStatusResult): string {
  return renderDocumentText(buildProfileStatusView(result));
}

export function formatProfileList(profiles: readonly ProfileSummary[]): string {
  return renderDocumentText(buildProfileListView(profiles));
}

type FormatConfigureAuthenticationOptions = {
  planes?: ConfigureAuthPlane[];
  indent?: string;
  labelWidth?: number;
};

function renderConfigureRows(
  rows: Parameters<typeof renderRows>[0],
  options: FormatConfigureAuthenticationOptions,
): string[] {
  return renderRows(rows, {
    indent: options.indent ?? TERMINAL_INDENT,
    labelWidth: options.labelWidth ?? TERMINAL_LABEL_WIDTH,
    nestedIndent: nestedIndent(options.indent),
    nestedLabelWidth: TERMINAL_NESTED_LABEL_WIDTH,
  });
}

export function formatConfigureAuthenticationLines(
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  return renderConfigureRows(
    configureAuthenticationRows(buildConfigureShowData(), options.planes),
    options,
  );
}

export function formatConfigureSessionSummary(configuredPlanes: ConfigureAuthPlane[]): string[] {
  return formatConfigureAuthenticationLines({ planes: configuredPlanes });
}

export function formatActiveContextSummary(context: ActiveContext): string {
  const lines = renderDocument(buildActiveContextSummaryView(context));
  return `\n\n${formatTerminalSection(padLeft(lines))}`;
}

export function formatActiveContextDetails(context: ActiveContext): string {
  const lines = renderDocument(buildActiveContextDetailsView(context), {
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
