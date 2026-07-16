import {
  buildProfileInspectView,
  buildProfileListView,
  buildProfileStatusView,
  configureAuthenticationRows,
  type ProfileStatusResult,
} from "@/lib/profile/views.ts";
import {
  buildConfigureShowData,
  type ProfileInspect,
  type ProfileSummary,
} from "@/lib/profile/model.ts";
import type { ConfigureAuthPlane } from "@/lib/profile-status.ts";
import { renderDocumentText, renderRows } from "@/ui/renderers/terminal.ts";
import {
  nestedIndent,
  TERMINAL_INDENT,
  TERMINAL_LABEL_WIDTH,
  TERMINAL_NESTED_LABEL_WIDTH,
} from "@/ui/terminal/spacing.ts";

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
  profileName: string,
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  return renderConfigureRows(
    configureAuthenticationRows(buildConfigureShowData(profileName), options.planes),
    options,
  );
}

export function formatConfigureSessionSummary(
  profileName: string,
  configuredPlanes: ConfigureAuthPlane[],
): string[] {
  return formatConfigureAuthenticationLines(profileName, { planes: configuredPlanes });
}
