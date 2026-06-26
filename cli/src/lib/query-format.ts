import type {
  LakehouseColumn,
  LakehouseQueryResult,
  LakehouseRow,
} from "@/lib/lakehouse-ndjson.ts";
import { getQueryDefaultLayout, getQueryDefaultMaxColumnWidth } from "@/lib/config.ts";

const DEFAULT_TERMINAL_WIDTH = 80;
const DEFAULT_MAX_COLUMN_WIDTH = 32;
const COLUMN_GAP = 2;
const NULL_DISPLAY = "NULL";
const ELLIPSIS = "…";

const ANSI_RESET = "\u001b[0m";
const ANSI_KEY = "\u001b[36m";
const ANSI_STRING = "\u001b[32m";
const ANSI_NUMBER = "\u001b[33m";
const ANSI_BOOLEAN = "\u001b[35m";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QueryLayout = "auto" | "table" | "expanded";

export type QueryDisplayOptions = {
  layout: QueryLayout;
  maxColumnWidth: number;
  terminalWidth: number;
  columns?: string[];
  colorize?: boolean;
};

function getTerminalWidth(): number {
  return process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH;
}

export function defaultDisplayOptions(): QueryDisplayOptions {
  return {
    layout: getQueryDefaultLayout() ?? "auto",
    maxColumnWidth: getQueryDefaultMaxColumnWidth() ?? DEFAULT_MAX_COLUMN_WIDTH,
    terminalWidth: getTerminalWidth(),
    colorize: true,
  };
}

export function highlightJsonForTerminal(json: string, enabled: boolean): string {
  if (!enabled) {
    return json;
  }

  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, keyPart, stringPart, booleanPart) => {
      if (keyPart !== undefined) {
        return `${ANSI_KEY}${keyPart}${ANSI_RESET}:`;
      }
      if (stringPart !== undefined) {
        return `${ANSI_STRING}${stringPart}${ANSI_RESET}`;
      }
      if (booleanPart !== undefined) {
        return `${ANSI_BOOLEAN}${booleanPart}${ANSI_RESET}`;
      }
      return `${ANSI_NUMBER}${match}${ANSI_RESET}`;
    },
  );
}

function isUuidString(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }
  if (maxWidth <= 1) {
    return ELLIPSIS;
  }
  return text.slice(0, maxWidth - ELLIPSIS.length) + ELLIPSIS;
}

function shortenUuid(value: string): string {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 8)}${ELLIPSIS}${value.slice(-4)}`;
}

export function formatQueryCellRaw(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

export function formatQueryCell(
  value: unknown,
  options: { maxWidth?: number; expanded: boolean; colorize?: boolean },
): string {
  if (value === null || value === undefined) {
    return NULL_DISPLAY;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    if (isUuidString(value) && !options.expanded) {
      return shortenUuid(value);
    }
    if (options.maxWidth !== undefined && !options.expanded) {
      return truncateText(value, options.maxWidth);
    }
    return value;
  }
  const jsonText = JSON.stringify(value);
  const shouldColorize =
    options.colorize === true && !options.expanded && process.stdout.isTTY === true;
  const displayText =
    options.maxWidth !== undefined && !options.expanded
      ? truncateText(jsonText, options.maxWidth)
      : jsonText;
  return highlightJsonForTerminal(displayText, shouldColorize);
}

export function getQueryColumnNames(result: LakehouseQueryResult): string[] {
  if (result.columns.length > 0) {
    if (typeof result.columns[0] === "string") {
      return result.columns as string[];
    }
    return (result.columns as LakehouseColumn[]).map((column, index) => {
      if (typeof column.name === "string" && column.name.length > 0) {
        return column.name;
      }
      return `column_${index + 1}`;
    });
  }

  const firstRow = result.rows[0];
  if (firstRow !== undefined && !Array.isArray(firstRow) && typeof firstRow === "object") {
    return Object.keys(firstRow);
  }

  if (firstRow !== undefined && Array.isArray(firstRow)) {
    return firstRow.map((_value, index) => `column_${index + 1}`);
  }

  return [];
}

export function selectColumnNames(allNames: string[], selected?: string[]): string[] {
  if (selected === undefined || selected.length === 0) {
    return allNames;
  }

  const nameSet = new Set(allNames);
  const filtered = selected.filter((name) => nameSet.has(name));
  if (filtered.length === 0) {
    return allNames;
  }
  return filtered;
}

function getRowCellValues(row: LakehouseRow, columnNames: string[]): unknown[] {
  if (Array.isArray(row)) {
    const allNames = columnNames;
    return allNames.map((_name, columnIndex) => row[columnIndex]);
  }
  return columnNames.map((name) => row[name]);
}

function computeColumnWidths(
  columnNames: string[],
  formattedCells: string[][],
  terminalWidth: number,
  maxColumnWidth: number,
): number[] {
  const naturalWidths = columnNames.map((name, columnIndex) => {
    const cellWidths = formattedCells.map((cells) => cells[columnIndex]?.length ?? 0);
    const natural = Math.max(name.length, ...cellWidths);
    return Math.min(natural, maxColumnWidth);
  });

  const minimumWidths = columnNames.map((name) => Math.min(name.length, maxColumnWidth));

  const gapTotal = columnNames.length > 1 ? (columnNames.length - 1) * COLUMN_GAP : 0;
  const totalNatural = naturalWidths.reduce((sum, width) => sum + width, 0) + gapTotal;

  if (totalNatural <= terminalWidth || columnNames.length === 0) {
    return naturalWidths;
  }

  let remainingWidth = terminalWidth - gapTotal;
  const widths = [...minimumWidths];
  let flexibleColumns = columnNames.map((_name, columnIndex) => columnIndex);

  while (flexibleColumns.length > 0 && remainingWidth > 0) {
    const share = Math.floor(remainingWidth / flexibleColumns.length);
    if (share === 0) {
      break;
    }

    const nextFlexible: number[] = [];
    for (const columnIndex of flexibleColumns) {
      const currentWidth = widths[columnIndex] ?? minimumWidths[columnIndex] ?? 0;
      const targetWidth = Math.min(
        naturalWidths[columnIndex] ?? currentWidth,
        currentWidth + share,
      );
      widths[columnIndex] = targetWidth;
      remainingWidth -= targetWidth - currentWidth;

      if (targetWidth < (naturalWidths[columnIndex] ?? targetWidth)) {
        nextFlexible.push(columnIndex);
      }
    }
    flexibleColumns = nextFlexible;
  }

  return widths;
}

function computeMinimumTableWidth(
  columnNames: string[],
  formattedCells: string[][],
  maxColumnWidth: number,
): number {
  const widths = computeColumnWidths(
    columnNames,
    formattedCells,
    Number.MAX_SAFE_INTEGER,
    maxColumnWidth,
  );
  const gapTotal = columnNames.length > 1 ? (columnNames.length - 1) * COLUMN_GAP : 0;
  return widths.reduce((sum, width) => sum + width, 0) + gapTotal;
}

function formatCellsForTable(
  result: LakehouseQueryResult,
  columnNames: string[],
  columnWidths: number[],
  colorize: boolean,
): string[][] {
  return result.rows.map((row) => {
    const values = getRowCellValues(row, columnNames);
    return values.map((value, columnIndex) => {
      const width = columnWidths[columnIndex] ?? DEFAULT_MAX_COLUMN_WIDTH;
      return formatQueryCell(value, { maxWidth: width, expanded: false, colorize });
    });
  });
}

function renderQueryTable(
  result: LakehouseQueryResult,
  columnNames: string[],
  options: QueryDisplayOptions,
): string {
  if (result.rows.length === 0) {
    if (columnNames.length === 0) {
      return "(no rows)";
    }
    return columnNames.join("  ");
  }

  const rawCells = result.rows.map((row) =>
    getRowCellValues(row, columnNames).map((value) => formatQueryCellRaw(value)),
  );
  const columnWidths = computeColumnWidths(
    columnNames,
    rawCells,
    options.terminalWidth,
    options.maxColumnWidth,
  );
  const rowValues = formatCellsForTable(
    result,
    columnNames,
    columnWidths,
    options.colorize ?? true,
  );

  const header = columnNames
    .map((name, columnIndex) => {
      const width = columnWidths[columnIndex] ?? name.length;
      return truncateText(name, width).padEnd(width);
    })
    .join(" ".repeat(COLUMN_GAP));
  const separator = columnWidths.map((width) => "-".repeat(width)).join(" ".repeat(COLUMN_GAP));
  const body = rowValues
    .map((cells) =>
      cells
        .map((cell, columnIndex) => {
          const width = columnWidths[columnIndex] ?? cell.length;
          return cell.padEnd(width);
        })
        .join(" ".repeat(COLUMN_GAP)),
    )
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

function renderQueryExpanded(
  result: LakehouseQueryResult,
  columnNames: string[],
  _options: QueryDisplayOptions,
): string {
  if (result.rows.length === 0) {
    return "(no rows)";
  }

  const labelWidth = columnNames.reduce((maxWidth, name) => Math.max(maxWidth, name.length), 0);

  const records = result.rows.map((row, rowIndex) => {
    const values = getRowCellValues(row, columnNames);
    const header = `-[ record ${rowIndex + 1} ]-`;
    const lines = columnNames.map((name, columnIndex) => {
      const label = name.padEnd(labelWidth);
      const value = formatQueryCell(values[columnIndex], { expanded: true });
      return `${label}  ${value}`;
    });
    return `${header}\n${lines.join("\n")}`;
  });

  return records.join("\n\n");
}

function formatFooterQueryId(queryId: string): string {
  if (queryId.length > 20 && isUuidString(queryId)) {
    return shortenUuid(queryId);
  }
  return queryId;
}

export function renderQueryFooter(result: LakehouseQueryResult): string {
  const rowCount = result.rows.length;
  const initTimeMs = result.metadata.init_time_ms;
  const queryId = result.metadata.query_id;

  const hasInitTime = typeof initTimeMs === "number";
  const hasQueryId = typeof queryId === "string" && queryId.length > 0;

  if (rowCount === 0 && !hasInitTime && !hasQueryId) {
    return "";
  }

  const rowLabel = rowCount === 1 ? "row" : "rows";
  let footer = `${rowCount} ${rowLabel}`;

  if (hasInitTime) {
    footer += ` in ${initTimeMs}ms`;
  }
  if (hasQueryId) {
    footer += `  query_id: ${formatFooterQueryId(queryId)}`;
  }

  return footer;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderQueryMarkdown(
  result: LakehouseQueryResult,
  columnNames: string[],
  options: QueryDisplayOptions,
): string {
  const selectedNames = selectColumnNames(columnNames, options.columns);

  if (selectedNames.length === 0 && result.rows.length === 0) {
    const footer = renderQueryFooter(result);
    return footer.length > 0 ? `<!-- ${footer} -->` : "(no rows)";
  }

  const headerRow = `| ${selectedNames.map((name) => escapeMarkdownCell(name)).join(" | ")} |`;
  const separatorRow = `| ${selectedNames.map(() => "---").join(" | ")} |`;
  const bodyRows = result.rows.map((row) => {
    const values = getRowCellValues(row, selectedNames);
    const cells = values
      .map((value) =>
        escapeMarkdownCell(formatQueryCell(value, { expanded: true, colorize: false })),
      )
      .join(" | ");
    return `| ${cells} |`;
  });

  const tableLines = [headerRow, separatorRow, ...bodyRows];
  const footer = renderQueryFooter(result);
  if (footer.length === 0) {
    return tableLines.join("\n");
  }

  return `${tableLines.join("\n")}\n\n<!-- ${footer} -->`;
}

export function renderQueryHumanOutput(
  result: LakehouseQueryResult,
  options: QueryDisplayOptions,
): string {
  const allColumnNames = getQueryColumnNames(result);
  const columnNames = selectColumnNames(allColumnNames, options.columns);

  const rawCells = result.rows.map((row) =>
    getRowCellValues(row, columnNames).map((value) => formatQueryCellRaw(value)),
  );
  const minimumTableWidth = computeMinimumTableWidth(columnNames, rawCells, options.maxColumnWidth);

  let body: string;
  if (options.layout === "expanded") {
    body = renderQueryExpanded(result, columnNames, options);
  } else if (options.layout === "table") {
    body = renderQueryTable(result, columnNames, options);
  } else if (minimumTableWidth > options.terminalWidth) {
    body = renderQueryExpanded(result, columnNames, options);
  } else {
    body = renderQueryTable(result, columnNames, options);
  }

  const footer = renderQueryFooter(result);
  if (footer.length === 0) {
    return body;
  }

  return `${body}\n\n${footer}`;
}
