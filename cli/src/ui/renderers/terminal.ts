import {
  type DisplayBlock,
  type DisplayDocument,
  type DisplayRow,
  type DisplaySection,
} from "@/ui/document.ts";
import {
  nestedIndent,
  TERMINAL_INDENT,
  TERMINAL_LABEL_WIDTH,
  TERMINAL_NESTED_LABEL_WIDTH,
} from "@/ui/terminal/spacing.ts";
import { renderFixedTable } from "@/ui/terminal/table.ts";
import { formatTerminalLabelValue } from "@/ui/terminal/styles.ts";

export type TerminalRenderOptions = {
  indent?: string;
  labelWidth?: number;
  nestedIndent?: string;
  nestedLabelWidth?: number;
};

export function renderRows(
  rows: readonly DisplayRow[],
  options: TerminalRenderOptions = {},
): string[] {
  const indent = options.indent ?? TERMINAL_INDENT;
  const labelWidth = options.labelWidth ?? TERMINAL_LABEL_WIDTH;
  const childIndent = options.nestedIndent ?? nestedIndent(indent);
  const nestedLabelWidth = options.nestedLabelWidth ?? TERMINAL_NESTED_LABEL_WIDTH;

  return rows.map((row) =>
    formatTerminalLabelValue(row.label, row.value, {
      indent: row.level === 1 ? childIndent : indent,
      labelWidth: row.level === 1 ? nestedLabelWidth : labelWidth,
      linkifyUrls: row.linkifyUrls,
    }),
  );
}

function renderBlock(block: DisplayBlock, options: TerminalRenderOptions): string[] {
  if (block.kind === "text") {
    return [...block.lines];
  }
  if (block.kind === "table") {
    return renderFixedTable(
      [...block.table.rows],
      [...block.table.columns],
      block.table.emptyMessage,
      block.table.options,
    ).split("\n");
  }
  return renderRows(block.rows, options);
}

function renderSection(section: DisplaySection, options: TerminalRenderOptions): string[] {
  return section.blocks.flatMap((block) => renderBlock(block, options));
}

export function renderDocument(
  document: DisplayDocument,
  options: TerminalRenderOptions = {},
): string[] {
  return document.sections.flatMap((section, index) => [
    ...(index === 0 ? [] : [""]),
    ...renderSection(section, options),
  ]);
}

export function renderDocumentText(
  document: DisplayDocument,
  options: TerminalRenderOptions = {},
): string {
  return renderDocument(document, options).join("\n");
}
