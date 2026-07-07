import { formatTerminalLabelValue } from "@/lib/terminal-style.ts";

export type DisplayRow = {
  label: string;
  value: string;
  level?: 0 | 1;
  linkifyUrls?: boolean;
};

export type DisplayBlock =
  | {
      kind: "rows";
      rows: readonly DisplayRow[];
    }
  | {
      kind: "text";
      lines: readonly string[];
    };

export type DisplaySection = {
  blocks: readonly DisplayBlock[];
};

export type DisplayDocument = {
  sections: readonly DisplaySection[];
};

export type DisplayRenderOptions = {
  indent?: string;
  labelWidth?: number;
  nestedIndent?: string;
  nestedLabelWidth?: number;
};

export function rows(rows: readonly DisplayRow[]): DisplayBlock {
  return { kind: "rows", rows };
}

export function text(lines: readonly string[]): DisplayBlock {
  return { kind: "text", lines };
}

export function section(...blocks: readonly DisplayBlock[]): DisplaySection {
  return { blocks };
}

export function document(...sections: readonly DisplaySection[]): DisplayDocument {
  return { sections };
}

export function renderDisplayRows(
  rows: readonly DisplayRow[],
  options: DisplayRenderOptions = {},
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

function renderDisplayBlock(block: DisplayBlock, options: DisplayRenderOptions): string[] {
  if (block.kind === "text") {
    return [...block.lines];
  }
  return renderDisplayRows(block.rows, options);
}

function renderDisplaySection(section: DisplaySection, options: DisplayRenderOptions): string[] {
  return section.blocks.flatMap((block) => renderDisplayBlock(block, options));
}

export function renderDisplayDocument(
  document: DisplayDocument,
  options: DisplayRenderOptions = {},
): string[] {
  return document.sections.flatMap((section, index) => [
    ...(index === 0 ? [] : [""]),
    ...renderDisplaySection(section, options),
  ]);
}
