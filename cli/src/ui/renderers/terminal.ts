import {
  span,
  type DisplayBlock,
  type DisplayDocument,
  type DisplayRow,
  type DisplaySection,
} from "@/ui/document.ts";
import type { TreeNode, TreeView } from "@/ui/layouts/tree.ts";
import {
  nestedIndent,
  TERMINAL_INDENT,
  TERMINAL_LABEL_WIDTH,
  TERMINAL_NESTED_LABEL_WIDTH,
} from "@/ui/terminal/spacing.ts";
import { renderFixedTable } from "@/ui/terminal/table.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export type TerminalRenderOptions = {
  indent?: string;
  labelWidth?: number;
  nestedIndent?: string;
  nestedLabelWidth?: number;
};

function renderLabelValue(
  label: string,
  value: string,
  options: { indent: string; labelWidth: number },
): string {
  return `${options.indent}${renderDisplayText([span(label.padEnd(options.labelWidth), "muted")])} ${value}`;
}

export function renderRows(
  rows: readonly DisplayRow[],
  options: TerminalRenderOptions = {},
): string[] {
  const indent = options.indent ?? TERMINAL_INDENT;
  const labelWidth = options.labelWidth ?? TERMINAL_LABEL_WIDTH;
  const childIndent = options.nestedIndent ?? nestedIndent(indent);
  const nestedLabelWidth = options.nestedLabelWidth ?? TERMINAL_NESTED_LABEL_WIDTH;

  return rows.map((row) =>
    renderLabelValue(row.label, renderDisplayText(row.value), {
      indent: row.level === 1 ? childIndent : indent,
      labelWidth: row.level === 1 ? nestedLabelWidth : labelWidth,
    }),
  );
}

function renderBlock(block: DisplayBlock, options: TerminalRenderOptions): string[] {
  if (block.kind === "text") {
    return block.lines.map(renderDisplayText);
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

const TREE_BRANCH = "├── ";
const TREE_LAST_BRANCH = "└── ";
const TREE_CHILD_PREFIX = "│   ";
const TREE_LAST_CHILD_PREFIX = "    ";

function renderTreeNodes(nodes: readonly TreeNode[], prefix: string): string[] {
  return nodes.flatMap((node, index) => {
    const isLast = index === nodes.length - 1;
    const branch = isLast ? TREE_LAST_BRANCH : TREE_BRANCH;
    const childPrefix = `${prefix}${isLast ? TREE_LAST_CHILD_PREFIX : TREE_CHILD_PREFIX}`;
    const children = node.children ?? [];
    const lines = [`${prefix}${branch}${renderDisplayText(node.label)}`];

    if (children.length > 0) {
      lines.push(...renderTreeNodes(children, childPrefix));
    } else if (node.emptyLabel) {
      lines.push(`${childPrefix}${TREE_LAST_BRANCH}${renderDisplayText(node.emptyLabel)}`);
    }

    return lines;
  });
}

export function renderTree(view: TreeView): string[] {
  const lines = view.title ? [renderDisplayText(view.title)] : [];

  if (view.children.length === 0) {
    lines.push(`${TREE_LAST_BRANCH}${renderDisplayText(view.emptyLabel ?? "<empty>")}`);
    return lines;
  }

  lines.push(...renderTreeNodes(view.children, ""));
  return lines;
}

export function renderTreeText(view: TreeView): string {
  return renderTree(view).join("\n");
}
