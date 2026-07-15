import type {
  LakehouseColumn,
  LakehouseQueryResult,
  LakehouseRow,
} from "@/lib/lakehouse-ndjson.ts";
import { getQueryDefaultMaxColumnWidth, getQueryDefaultLayout } from "@/lib/config.ts";
import {
  getColumnTypeMap,
  isTimestampValue,
  resolveCellDataType,
  selectDisplayColumnNames,
  type ColumnTypeMap,
  type QueryDataType,
} from "@/lib/query-column-types.ts";
import { pluralizeLabel } from "@/lib/pluralize.ts";
import { redactPasswordFieldInText } from "@/lib/redact.ts";
import { formatRelativeTimestamp, formatTimestampWithRelative } from "@/lib/relative-time.ts";
import {
  getTerminalWidth,
  getVisibleTextWidth,
  padVisibleText,
  renderDisplayText,
  shouldUseTerminalColor,
  truncateTerminalText,
  type TerminalTextAlignment,
} from "@/ui/terminal/styles.ts";
import type { QueryLayout } from "@/ui/layouts/query.ts";
import { span, type DisplayTextStyle } from "@/ui/document.ts";

const DEFAULT_MAX_COLUMN_WIDTH = 32;
const TABLE_CELL_PADDING = 1;
const NULL_DISPLAY = "NULL";
const ELLIPSIS = "…";
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type QueryColumnAlignment = TerminalTextAlignment;

type QueryDisplayRow = {
  values: unknown[];
  rawCells: string[];
};

type QueryRenderModel = {
  columnNames: string[];
  columnTypeMap: ColumnTypeMap;
  rows: QueryDisplayRow[];
};

export type QueryCellOptions = {
  /** When set, truncate display text to this width. Omit for full values (line mode). */
  maxWidth?: number;
  colorize?: boolean;
  includeRelative?: boolean;
  columnName?: string;
  columnTypeMap?: ColumnTypeMap;
};

export type QueryDisplayOptions = {
  layout: QueryLayout;
  maxColumnWidth: number;
  terminalWidth: number;
  columns?: string[];
  colorize?: boolean;
};

export function defaultDisplayOptions(): QueryDisplayOptions {
  return {
    layout: getQueryDefaultLayout() ?? "auto",
    maxColumnWidth: getQueryDefaultMaxColumnWidth() ?? DEFAULT_MAX_COLUMN_WIDTH,
    terminalWidth: getTerminalWidth(),
    colorize: true,
  };
}

function shouldColorizeQueryCells(colorize: boolean | undefined): boolean {
  return colorize === true && shouldUseTerminalColor();
}

function queryDataTypeStyle(dataType: QueryDataType): DisplayTextStyle {
  switch (dataType) {
    case "null":
      return "subtle";
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "uuid":
      return "accent";
    case "string":
    case "timestamp":
      return "string";
  }
}

function parseJsonStringValue(value: string): string | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

function styleQueryHeader(
  name: string,
  width: number,
  colorize: boolean,
  alignment: QueryColumnAlignment,
): string {
  const truncated = truncateText(renderDisplayText(name), width);
  const padded = padVisibleText(truncated, width, alignment);
  if (!shouldColorizeQueryCells(colorize)) {
    return padded;
  }
  return renderDisplayText([span(padded, "accent")]);
}

function styleQueryTableChrome(text: string, colorize: boolean): string {
  return shouldColorizeQueryCells(colorize) ? renderDisplayText([span(text, "subtle")]) : text;
}

export function highlightJsonForTerminal(json: string, enabled: boolean): string {
  if (!enabled) {
    return json;
  }

  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, keyPart, stringPart, booleanPart) => {
      if (keyPart !== undefined) {
        return renderDisplayText([span(keyPart, "accent"), span(":")]);
      }
      if (stringPart !== undefined) {
        return renderDisplayText([span(stringPart, "string")]);
      }
      if (booleanPart !== undefined) {
        if (booleanPart === "null") {
          return renderDisplayText([span(booleanPart, "subtle")]);
        }
        if (booleanPart === "false") {
          return renderDisplayText([span(booleanPart, "subtle")]);
        }
        return renderDisplayText([span(booleanPart, "boolean")]);
      }
      return renderDisplayText([span(match, "number")]);
    },
  );
}

function truncateDisplayText(text: string, maxWidth?: number): string {
  if (maxWidth === undefined) {
    return text;
  }
  return truncateText(text, maxWidth);
}

function truncateDisplayTextMiddle(text: string, maxWidth?: number): string {
  if (maxWidth === undefined) {
    return text;
  }
  return truncateTextMiddle(text, maxWidth);
}

function formatTimestampQueryCell(
  value: string,
  options: QueryCellOptions,
  colorize: boolean,
): string {
  const includeRelative = options.includeRelative === true;
  const relative = includeRelative ? formatRelativeTimestamp(value) : null;
  const plainDisplay = formatTimestampWithRelative(value, { includeRelative });

  const display = truncateDisplayText(plainDisplay, options.maxWidth);

  if (!colorize) {
    return display;
  }

  if (relative === null || display === value) {
    return renderDisplayText([span(display, "string")]);
  }

  return renderDisplayText([span(value, "string"), span(` ${relative}`, "subtle")]);
}

function formatStringQueryCell(
  value: string,
  options: QueryCellOptions,
  colorize: boolean,
): string {
  const sanitized = redactPasswordFieldInText(value);
  if (sanitized.length === 0) {
    return colorize ? renderDisplayText([span('""', "subtle")]) : '""';
  }

  const columnTypeMap = options.columnTypeMap ?? new Map();
  const dataType = resolveCellDataType(sanitized, options.columnName, columnTypeMap);
  const jsonText = parseJsonStringValue(sanitized);

  if (dataType === "timestamp" && isTimestampValue(sanitized)) {
    return formatTimestampQueryCell(sanitized, options, colorize);
  }

  if (jsonText !== null) {
    const displayText = truncateDisplayText(jsonText, options.maxWidth);
    if (!colorize) {
      return renderDisplayText(displayText);
    }
    return highlightJsonForTerminal(displayText, true);
  }

  const safeValue = renderDisplayText(sanitized);
  const display =
    dataType === "uuid"
      ? truncateDisplayTextMiddle(safeValue, options.maxWidth)
      : truncateDisplayText(safeValue, options.maxWidth);

  if (!colorize) {
    return display;
  }

  return renderDisplayText([span(display, queryDataTypeStyle(dataType))]);
}

export function truncateText(text: string, maxWidth: number): string {
  return truncateTerminalText(text, maxWidth);
}

export function truncateTextMiddle(text: string, maxWidth: number): string {
  if (getVisibleTextWidth(text) <= maxWidth) {
    return text;
  }
  if (maxWidth <= 1) {
    return ELLIPSIS;
  }

  const characters = Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
  const availableWidth = maxWidth - getVisibleTextWidth(ELLIPSIS);
  const prefixWidth = Math.ceil(availableWidth / 2);
  const suffixWidth = Math.floor(availableWidth / 2);
  let prefix = "";
  let suffix = "";

  for (const character of characters) {
    if (getVisibleTextWidth(prefix + character) > prefixWidth) {
      break;
    }
    prefix += character;
  }
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index] ?? "";
    if (getVisibleTextWidth(character + suffix) > suffixWidth) {
      break;
    }
    suffix = character + suffix;
  }
  return `${prefix}${ELLIPSIS}${suffix}`;
}

export function formatQueryCellRaw(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return redactPasswordFieldInText(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

export function formatQueryCell(value: unknown, options: QueryCellOptions): string {
  const colorize = shouldColorizeQueryCells(options.colorize);

  if (value === null || value === undefined) {
    return colorize ? renderDisplayText([span(NULL_DISPLAY, "subtle")]) : NULL_DISPLAY;
  }
  if (typeof value === "boolean") {
    const text = String(value);
    if (!colorize) {
      return text;
    }
    if (value === false) {
      return renderDisplayText([span(text, "subtle")]);
    }
    return renderDisplayText([span(text, "boolean")]);
  }
  if (typeof value === "number" || typeof value === "bigint") {
    const text = String(value);
    return colorize ? renderDisplayText([span(text, "number")]) : text;
  }
  if (typeof value === "string") {
    return formatStringQueryCell(value, options, colorize);
  }

  const displayText = truncateDisplayText(JSON.stringify(value), options.maxWidth);

  if (!colorize) {
    return displayText;
  }
  return highlightJsonForTerminal(displayText, true);
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

function getRowCellValues(
  row: LakehouseRow,
  columnNames: string[],
  allColumnNames: string[],
): unknown[] {
  if (Array.isArray(row)) {
    return columnNames.map((name) => {
      const columnIndex = allColumnNames.indexOf(name);
      if (columnIndex < 0) {
        return undefined;
      }
      return row[columnIndex];
    });
  }
  return columnNames.map((name) => row[name]);
}

function collectQueryDisplayRows(
  result: LakehouseQueryResult,
  columnNames: string[],
  allColumnNames: string[],
): QueryDisplayRow[] {
  return result.rows.map((row) => {
    const values = getRowCellValues(row, columnNames, allColumnNames);
    return {
      values,
      rawCells: values.map((value) => renderDisplayText(formatQueryCellRaw(value))),
    };
  });
}

function buildQueryRenderModel(
  result: LakehouseQueryResult,
  options: QueryDisplayOptions,
): QueryRenderModel {
  const allColumnNames = getQueryColumnNames(result);
  const columnTypeMap = getColumnTypeMap(result.columns);
  const { columns: columnNames } = selectDisplayColumnNames(allColumnNames, options);
  return {
    columnNames,
    columnTypeMap,
    rows: collectQueryDisplayRows(result, columnNames, allColumnNames),
  };
}

function computeColumnWidths(
  columnNames: string[],
  formattedCells: string[][],
  terminalWidth: number,
  maxColumnWidth: number,
): number[] {
  const naturalWidths = columnNames.map((name, columnIndex) => {
    const nameWidth = getVisibleTextWidth(renderDisplayText(name));
    const cellWidths = formattedCells.map((cells) => getVisibleTextWidth(cells[columnIndex] ?? ""));
    const natural = Math.max(nameWidth, ...cellWidths);
    return Math.min(natural, maxColumnWidth);
  });

  const minimumWidths = columnNames.map((name) =>
    Math.min(getVisibleTextWidth(renderDisplayText(name)), maxColumnWidth),
  );

  const totalNatural = naturalWidths.reduce((sum, width) => sum + width, 0);

  if (totalNatural <= terminalWidth || columnNames.length === 0) {
    return naturalWidths;
  }

  let remainingWidth = terminalWidth;
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

function getTableFrameWidth(columnCount: number): number {
  if (columnCount === 0) {
    return 0;
  }
  const outerBorders = 2;
  const innerBorders = Math.max(0, columnCount - 1);
  return outerBorders + innerBorders + columnCount * TABLE_CELL_PADDING * 2;
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
  return widths.reduce((sum, width) => sum + width, 0) + getTableFrameWidth(columnNames.length);
}

function getColumnAlignment(
  rows: QueryDisplayRow[],
  columnIndex: number,
  columnName: string,
  columnTypeMap: ColumnTypeMap,
): QueryColumnAlignment {
  for (const row of rows) {
    const value = row.values[columnIndex];
    const dataType = resolveCellDataType(value, columnName, columnTypeMap);
    if (dataType === "null") {
      continue;
    }
    if (dataType === "number") {
      return "right";
    }
    if (dataType === "boolean") {
      return "center";
    }
    return "left";
  }

  const columnType = columnTypeMap.get(columnName);
  const inferredType = resolveCellDataType("", columnName, new Map([[columnName, columnType]]));
  if (inferredType === "number") {
    return "right";
  }
  if (inferredType === "boolean") {
    return "center";
  }
  return "left";
}

function getColumnAlignments(
  rows: QueryDisplayRow[],
  columnNames: string[],
  columnTypeMap: ColumnTypeMap,
): QueryColumnAlignment[] {
  return columnNames.map((name, columnIndex) =>
    getColumnAlignment(rows, columnIndex, name, columnTypeMap),
  );
}

function renderQueryTableBorder(
  columnWidths: number[],
  position: "top" | "middle" | "bottom",
  colorize: boolean,
): string {
  const characters = {
    top: { left: "┌", separator: "┬", right: "┐" },
    middle: { left: "├", separator: "┼", right: "┤" },
    bottom: { left: "└", separator: "┴", right: "┘" },
  }[position];
  const segments = columnWidths.map((width) => "─".repeat(width + TABLE_CELL_PADDING * 2));
  return styleQueryTableChrome(
    `${characters.left}${segments.join(characters.separator)}${characters.right}`,
    colorize,
  );
}

function renderQueryTableRow(
  cells: string[],
  columnWidths: number[],
  alignments: QueryColumnAlignment[],
  colorize: boolean,
): string {
  const renderedCells = cells.map((cell, columnIndex) => {
    const width = columnWidths[columnIndex] ?? getVisibleTextWidth(cell);
    const alignment = alignments[columnIndex] ?? "left";
    const padded = padVisibleText(cell, width, alignment);
    return `${" ".repeat(TABLE_CELL_PADDING)}${padded}${" ".repeat(TABLE_CELL_PADDING)}`;
  });
  const border = styleQueryTableChrome("│", colorize);
  return `${border}${renderedCells.join(border)}${border}`;
}

function formatCellsForTable(
  rows: QueryDisplayRow[],
  columnNames: string[],
  columnWidths: number[],
  options: QueryDisplayOptions,
  columnTypeMap: ColumnTypeMap,
): string[][] {
  const colorize = options.colorize ?? true;
  return rows.map((row) =>
    row.values.map((value, columnIndex) => {
      const width = columnWidths[columnIndex] ?? DEFAULT_MAX_COLUMN_WIDTH;
      return formatQueryCell(value, {
        maxWidth: width,
        colorize,
        columnName: columnNames[columnIndex],
        columnTypeMap,
      });
    }),
  );
}

function renderQueryTable(model: QueryRenderModel, options: QueryDisplayOptions): string {
  const { columnNames, columnTypeMap, rows } = model;

  if (rows.length === 0) {
    if (columnNames.length === 0) {
      return "(no rows)";
    }
  }

  const availableCellWidth = Math.max(
    0,
    options.terminalWidth - getTableFrameWidth(columnNames.length),
  );
  const columnWidths = computeColumnWidths(
    columnNames,
    rows.map((row) => row.rawCells),
    options.layout === "table" ? Number.MAX_SAFE_INTEGER : availableCellWidth,
    options.maxColumnWidth,
  );
  const rowValues = formatCellsForTable(rows, columnNames, columnWidths, options, columnTypeMap);

  const colorize = options.colorize ?? true;
  const alignments = getColumnAlignments(rows, columnNames, columnTypeMap);

  const headerCells = columnNames.map((name, columnIndex) => {
    const width = columnWidths[columnIndex] ?? name.length;
    const alignment = alignments[columnIndex] ?? "left";
    return styleQueryHeader(name, width, colorize, alignment);
  });
  const lines = [
    renderQueryTableBorder(columnWidths, "top", colorize),
    renderQueryTableRow(headerCells, columnWidths, alignments, colorize),
    renderQueryTableBorder(columnWidths, "middle", colorize),
    ...rowValues.map((cells) => renderQueryTableRow(cells, columnWidths, alignments, colorize)),
    renderQueryTableBorder(columnWidths, "bottom", colorize),
  ];
  return lines.join("\n");
}

function renderQueryExpanded(model: QueryRenderModel, options: QueryDisplayOptions): string {
  const { columnNames, columnTypeMap, rows } = model;

  if (rows.length === 0) {
    return "(no rows)";
  }

  const colorize = options.colorize ?? true;
  const labelWidth =
    columnNames.reduce(
      (maxWidth, name) => Math.max(maxWidth, getVisibleTextWidth(renderDisplayText(name))),
      0,
    ) + 1;
  const showRowNumbers = rows.length > 1;

  const records = rows.map((row, rowIndex) => {
    const lines = columnNames.map((name, columnIndex) => {
      const value = formatQueryCell(row.values[columnIndex], {
        colorize,
        includeRelative: true,
        columnName: name,
        columnTypeMap,
      });
      const labelText = padVisibleText(`${renderDisplayText(name)}:`, labelWidth);
      const label = renderDisplayText([span(labelText, "muted")]);
      return `${label} ${value}`;
    });
    const body = lines.join("\n");
    if (showRowNumbers) {
      return `${styleQueryTableChrome(`#${rowIndex + 1}`, colorize)}\n${body}`;
    }
    return body;
  });

  return records.join("\n");
}

export function renderQueryFooter(
  result: LakehouseQueryResult,
  options: { colorize?: boolean } = {},
): string {
  const rowCount = result.rows.length;
  const initTimeMs = result.metadata.init_time_ms;
  const queryId = result.metadata.query_id;

  const hasInitTime = typeof initTimeMs === "number";
  const hasQueryId = typeof queryId === "string" && queryId.length > 0;

  if (rowCount === 0 && !hasInitTime && !hasQueryId) {
    return "";
  }

  const footerParts: string[] = [];

  if (rowCount > 0 || hasInitTime || hasQueryId) {
    let summary = hasInitTime
      ? `${pluralizeLabel(rowCount, "row")} in ${initTimeMs}ms`
      : pluralizeLabel(rowCount, "row");
    if (hasQueryId) {
      summary += `  query_id: ${queryId}`;
    }
    footerParts.push(summary);
  }

  const style = shouldColorizeQueryCells(options.colorize) ? "subtle" : undefined;
  return footerParts.map((line) => renderDisplayText([span(line, style)])).join("\n");
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
  const columnTypeMap = getColumnTypeMap(result.columns);

  if (selectedNames.length === 0 && result.rows.length === 0) {
    const footer = renderQueryFooter(result);
    return footer.length > 0 ? `<!-- ${footer} -->` : "(no rows)";
  }

  const headerRow = `| ${selectedNames.map((name) => escapeMarkdownCell(name)).join(" | ")} |`;
  const separatorRow = `| ${selectedNames.map(() => "---").join(" | ")} |`;
  const bodyRows = result.rows.map((row) => {
    const values = getRowCellValues(row, selectedNames, columnNames);
    const cells = values
      .map((value, columnIndex) =>
        escapeMarkdownCell(
          formatQueryCell(value, {
            colorize: false,
            columnName: selectedNames[columnIndex],
            columnTypeMap,
          }),
        ),
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
  const model = buildQueryRenderModel(result, options);

  const rawCells = model.rows.map((row) => row.rawCells);
  const minimumTableWidth = computeMinimumTableWidth(
    model.columnNames,
    rawCells,
    options.maxColumnWidth,
  );

  let body: string;
  if (options.layout === "line") {
    body = renderQueryExpanded(model, options);
  } else if (options.layout === "table") {
    body = renderQueryTable(model, options);
  } else if (minimumTableWidth > options.terminalWidth) {
    body = renderQueryExpanded(model, options);
  } else {
    body = renderQueryTable(model, options);
  }

  const footer = renderQueryFooter(result, {
    colorize: options.colorize ?? true,
  });
  if (footer.length === 0) {
    return body;
  }

  return `${body}\n\n${footer}`;
}
