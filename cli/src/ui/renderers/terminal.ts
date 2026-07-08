import {
  type DisplayBlock,
  type DisplayDocument,
  type DisplayRow,
  type DisplaySection,
} from "@/ui/document.ts";
import { renderFixedTable } from "@/ui/terminal/table-layout.ts";
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
  const indent = options.indent ?? "  ";
  const labelWidth = options.labelWidth ?? 17;
  const nestedIndent = options.nestedIndent ?? `${indent}  `;
  const nestedLabelWidth = options.nestedLabelWidth ?? 14;

  return rows.map((row) =>
    formatTerminalLabelValue(row.label, row.value, {
      indent: row.level === 1 ? nestedIndent : indent,
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
