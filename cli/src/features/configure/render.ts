import type { ConfigureAuthPlane } from "@/lib/configure-verify.ts";
import { buildConfigureShowData } from "@/features/configure/model.ts";
import {
  buildConfigureAuthenticationView,
  configureOverrideRows,
  configureSetupHintLines,
  type ConfigureShowView,
} from "@/features/configure/views.ts";
import { renderDocument, renderRows } from "@/ui/renderers/terminal.ts";
import {
  nestedIndent,
  TERMINAL_INDENT,
  TERMINAL_LABEL_WIDTH,
  TERMINAL_NESTED_LABEL_WIDTH,
} from "@/ui/terminal/spacing.ts";

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

export function renderConfigureShowView(
  view: ConfigureShowView,
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  return renderDocument(view.document, {
    indent: options.indent ?? TERMINAL_INDENT,
    labelWidth: options.labelWidth ?? TERMINAL_LABEL_WIDTH,
    nestedIndent: nestedIndent(options.indent),
    nestedLabelWidth: TERMINAL_NESTED_LABEL_WIDTH,
  });
}

export function formatConfigureAuthenticationLines(
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  return renderConfigureRows(buildConfigureAuthenticationView(options), options);
}

export function formatConfigureSetupHints(
  status: Parameters<typeof configureSetupHintLines>[0],
): string[] {
  return configureSetupHintLines(status);
}

export function formatConfigureEnvOverrideLines(
  indent: string = TERMINAL_INDENT,
  labelWidth: number = TERMINAL_LABEL_WIDTH,
): string[] {
  return renderRows(configureOverrideRows(buildConfigureShowData().overrides), {
    indent,
    labelWidth,
    nestedIndent: nestedIndent(indent),
    nestedLabelWidth: TERMINAL_NESTED_LABEL_WIDTH,
  });
}

export function formatConfigureSessionSummary(configuredPlanes: ConfigureAuthPlane[]): string[] {
  return formatConfigureAuthenticationLines({ planes: configuredPlanes });
}
