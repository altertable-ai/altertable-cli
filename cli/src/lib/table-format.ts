const COLUMN_GAP = "  ";
const ELLIPSIS = "…";

export type TableColumn<T> = {
  header: string;
  cell: (row: T) => string;
  maxWidth?: number;
};

function truncateCell(text: string, maxWidth?: number): string {
  if (maxWidth === undefined || text.length <= maxWidth) {
    return text;
  }
  if (maxWidth <= 1) {
    return ELLIPSIS;
  }
  return text.slice(0, maxWidth - ELLIPSIS.length) + ELLIPSIS;
}

export function renderFixedTable<T>(
  rows: T[],
  columns: TableColumn<T>[],
  emptyMessage = "No rows.",
): string {
  if (rows.length === 0) {
    return emptyMessage;
  }

  const formattedRows = rows.map((row) =>
    columns.map((column) => truncateCell(column.cell(row), column.maxWidth)),
  );

  const columnWidths = columns.map((column, columnIndex) => {
    const values = [column.header, ...formattedRows.map((cells) => cells[columnIndex] ?? "")];
    return Math.max(...values.map((value) => value.length));
  });

  function formatRow(cells: string[]): string {
    return cells
      .map((cell, columnIndex) => cell.padEnd(columnWidths[columnIndex] ?? cell.length))
      .join(COLUMN_GAP);
  }

  const header = formatRow(columns.map((column) => column.header));
  const body = formattedRows.map((cells) => formatRow(cells));
  return [header, ...body].join("\n");
}
