import {
  getTerminalWidth,
  getVisibleTextWidth,
  padVisibleText,
  terminalAccent,
  terminalHttpMethod,
  terminalMuted,
  terminalString,
  terminalStrong,
  terminalSubtle,
  terminalTableHeader,
  truncateTerminalText,
} from "@/ui/terminal/styles.ts";
import type {
  DisplayTableColumn,
  DisplayTableColumnStyle,
  DisplayTableOptions,
} from "@/ui/document.ts";

const COLUMN_GAP = "  ";
const FLEX_SHRINK_MIN_WIDTH = 4;

export type TableColumnStyle = DisplayTableColumnStyle;
export type TableColumn<T> = DisplayTableColumn<T>;
export type FixedTableRenderOptions<T> = DisplayTableOptions<T>;

function truncateCell(text: string, maxWidth?: number): string {
  return truncateTerminalText(text, maxWidth);
}

function applyCellStyle(text: string, style: TableColumnStyle = "foreground"): string {
  if (style === "subtle") {
    return terminalSubtle(text);
  }
  if (style === "muted") {
    return terminalMuted(text);
  }
  if (style === "accent") {
    return terminalAccent(text);
  }
  if (style === "string") {
    return terminalString(text);
  }
  if (style === "strong") {
    return terminalStrong(text);
  }
  if (style === "httpMethod") {
    return padVisibleText(terminalHttpMethod(text.trimEnd()), getVisibleTextWidth(text));
  }
  return text;
}

function applyHeaderStyle(text: string): string {
  return terminalTableHeader(text);
}

function tablePlainWidth(columnWidths: number[], columnCount: number): number {
  return (
    columnWidths.reduce((sum, width) => sum + width, 0) + (columnCount - 1) * COLUMN_GAP.length
  );
}

function computeNaturalColumnWidths<T>(
  columns: TableColumn<T>[],
  plainCells: string[][],
): number[] {
  return columns.map((column, columnIndex) => {
    const values = [column.header, ...plainCells.map((cells) => cells[columnIndex] ?? "")];
    return Math.max(...values.map((value) => getVisibleTextWidth(value)), 1);
  });
}

function shrinkFlexColumnsToFit<T>(
  columns: TableColumn<T>[],
  widths: number[],
  terminalWidth: number,
): number[] {
  const nextWidths = [...widths];
  const flexColumnIndexes = columns
    .map((column, columnIndex) => (column.flex ? columnIndex : -1))
    .filter((columnIndex) => columnIndex >= 0);

  while (tablePlainWidth(nextWidths, columns.length) > terminalWidth) {
    let shrank = false;
    for (const columnIndex of flexColumnIndexes) {
      if ((nextWidths[columnIndex] ?? 0) > FLEX_SHRINK_MIN_WIDTH) {
        nextWidths[columnIndex] = (nextWidths[columnIndex] ?? 0) - 1;
        shrank = true;
        if (tablePlainWidth(nextWidths, columns.length) <= terminalWidth) {
          break;
        }
      }
    }
    if (!shrank) {
      break;
    }
  }

  return nextWidths;
}

function computeColumnWidths<T>(
  columns: TableColumn<T>[],
  plainCells: string[][],
  options: FixedTableRenderOptions<T>,
): number[] {
  const naturalWidths = computeNaturalColumnWidths(columns, plainCells);
  const cappedWidths = naturalWidths.map((width, columnIndex) => {
    const maxWidth = columns[columnIndex]?.maxWidth;
    return maxWidth === undefined ? width : Math.min(width, maxWidth);
  });
  if (options.horizontalScroll) {
    return cappedWidths;
  }
  const terminalWidth = options.terminalWidth ?? getTerminalWidth();
  if (tablePlainWidth(cappedWidths, columns.length) <= terminalWidth) {
    return cappedWidths;
  }
  return shrinkFlexColumnsToFit(columns, cappedWidths, terminalWidth);
}

export function renderFixedTable<T>(
  rows: T[],
  columns: TableColumn<T>[],
  emptyMessage = "No rows.",
  options: FixedTableRenderOptions<T> = {},
): string {
  if (rows.length === 0) {
    return terminalSubtle(emptyMessage);
  }

  const plainCells = rows.map((row) => columns.map((column) => column.cell(row)));
  const columnWidths = computeColumnWidths(columns, plainCells, options);

  function formatRow(cells: string[], rowIndex: number): string {
    return cells
      .map((cell, columnIndex) => {
        const column = columns[columnIndex];
        const width = columnWidths[columnIndex] ?? getVisibleTextWidth(cell);
        const truncated = truncateCell(cell, width);
        const padded = padVisibleText(truncated, width);
        if (rowIndex < 0) {
          return applyHeaderStyle(padded);
        }
        return applyCellStyle(padded, column?.style);
      })
      .join(COLUMN_GAP);
  }

  const header = formatRow(
    columns.map((column) => column.header),
    -1,
  );

  const bodyLines: string[] = [];
  for (let rowIndex = 0; rowIndex < plainCells.length; rowIndex++) {
    const row = rows[rowIndex];
    const cells = plainCells[rowIndex];
    if (row === undefined || cells === undefined) {
      continue;
    }
    if (rowIndex > 0 && options.groupBy) {
      const previousRow = rows[rowIndex - 1];
      if (previousRow !== undefined && options.groupBy(previousRow) !== options.groupBy(row)) {
        bodyLines.push("");
      }
    }
    bodyLines.push(formatRow(cells, rowIndex));
  }

  return [header, ...bodyLines].join("\n");
}
