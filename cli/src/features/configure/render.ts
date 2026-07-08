import type { ConfigureAuthPlane } from "@/lib/configure-verify.ts";
import { buildConfigureShowData } from "@/features/configure/model.ts";
import { configureAuthenticationRows, type ConfigureShowView } from "@/features/configure/views.ts";
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
  return renderConfigureRows(
    configureAuthenticationRows(buildConfigureShowData(), options.planes),
    options,
  );
}

export function formatConfigureSessionSummary(configuredPlanes: ConfigureAuthPlane[]): string[] {
  return formatConfigureAuthenticationLines({ planes: configuredPlanes });
}
