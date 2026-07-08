import type { ConfigureAuthPlane } from "@/lib/configure-verify.ts";
import { buildConfigureShowData } from "@/features/configure/model.ts";
import {
  buildConfigureAuthenticationView,
  configureOverrideRows,
  configureSetupHintLines,
  type ConfigureShowView,
} from "@/features/configure/views.ts";
import { renderDocument, renderRows } from "@/ui/renderers/terminal.ts";

const DETAIL_INDENT = "  ";
const DETAIL_LABEL_WIDTH = 17;
const NESTED_INDENT = `${DETAIL_INDENT}  `;
const NESTED_LABEL_WIDTH = 14;

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
    indent: options.indent ?? DETAIL_INDENT,
    labelWidth: options.labelWidth ?? DETAIL_LABEL_WIDTH,
    nestedIndent: NESTED_INDENT,
    nestedLabelWidth: NESTED_LABEL_WIDTH,
  });
}

export function renderConfigureShowView(
  view: ConfigureShowView,
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  return renderDocument(view.document, {
    indent: options.indent ?? DETAIL_INDENT,
    labelWidth: options.labelWidth ?? DETAIL_LABEL_WIDTH,
    nestedIndent: NESTED_INDENT,
    nestedLabelWidth: NESTED_LABEL_WIDTH,
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
  indent: string = DETAIL_INDENT,
  labelWidth: number = DETAIL_LABEL_WIDTH,
): string[] {
  return renderRows(configureOverrideRows(buildConfigureShowData().overrides), {
    indent,
    labelWidth,
    nestedIndent: NESTED_INDENT,
    nestedLabelWidth: NESTED_LABEL_WIDTH,
  });
}

export function formatConfigureSessionSummary(configuredPlanes: ConfigureAuthPlane[]): string[] {
  return formatConfigureAuthenticationLines({ planes: configuredPlanes });
}
