import {
  getTerminalWidth,
  getVisibleTextWidth,
  padVisibleText,
  renderDisplayText,
  truncateTerminalText,
} from "@/ui/terminal/styles.ts";
import { span, type DisplayTableColumn, type DisplayTableOptions } from "@/ui/document.ts";

const COLUMN_GAP = "  ";
const FLEX_SHRINK_MIN_WIDTH = 4;

export type TableColumn<T> = DisplayTableColumn<T>;
export type FixedTableRenderOptions<T> = DisplayTableOptions<T>;

function truncateCell(text: string, maxWidth?: number): string {
  return truncateTerminalText(text, maxWidth);
}

function applyHeaderStyle(text: string): string {
  return renderDisplayText([span(text, "subtle")]);
}

function tablePlainWidth(columnWidths: number[], columnCount: number): number {
  return (
    columnWidths.reduce((sum, width) => sum + width, 0) + (columnCount - 1) * COLUMN_GAP.length
  );
}

function computeNaturalColumnWidths<T>(
  columns: TableColumn<T>[],
  renderedHeaders: string[],
  renderedCells: string[][],
): number[] {
  return columns.map((_column, columnIndex) => {
    const values = [
      renderedHeaders[columnIndex] ?? "",
      ...renderedCells.map((cells) => cells[columnIndex] ?? ""),
    ];
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
  renderedHeaders: string[],
  renderedCells: string[][],
  options: FixedTableRenderOptions<T>,
): number[] {
  const naturalWidths = computeNaturalColumnWidths(columns, renderedHeaders, renderedCells);
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
    return renderDisplayText([span(emptyMessage, "subtle")]);
  }

  const renderedHeaders = columns.map((column) => renderDisplayText(column.header.toUpperCase()));
  const renderedCells = rows.map((row) =>
    columns.map((column) => renderDisplayText(column.cell(row))),
  );
  const columnWidths = computeColumnWidths(columns, renderedHeaders, renderedCells, options);

  function formatRow(rowCells: readonly string[], rowIndex: number): string {
    return rowCells
      .map((cell, columnIndex) => {
        const width = columnWidths[columnIndex] ?? getVisibleTextWidth(cell);
        const truncated = truncateCell(cell, width);
        const padded = padVisibleText(truncated, width);
        if (rowIndex < 0) {
          return applyHeaderStyle(padded);
        }
        return padded;
      })
      .join(COLUMN_GAP);
  }

  const header = formatRow(renderedHeaders, -1);

  const bodyLines: string[] = [];
  for (let rowIndex = 0; rowIndex < renderedCells.length; rowIndex++) {
    const row = rows[rowIndex];
    const rowCells = renderedCells[rowIndex];
    if (row === undefined || rowCells === undefined) {
      continue;
    }
    if (rowIndex > 0 && options.groupBy) {
      const previousRow = rows[rowIndex - 1];
      if (previousRow !== undefined && options.groupBy(previousRow) !== options.groupBy(row)) {
        bodyLines.push("");
      }
    }
    bodyLines.push(formatRow(rowCells, rowIndex));
  }

  return [header, ...bodyLines].join("\n");
}
