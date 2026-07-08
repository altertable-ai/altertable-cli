export type DisplayRow = {
  label: string;
  value: string;
  level?: 0 | 1;
  linkifyUrls?: boolean;
};

export type DisplayTableColumnStyle =
  | "foreground"
  | "subtle"
  | "muted"
  | "accent"
  | "string"
  | "strong"
  | "httpMethod";

export type DisplayTableColumn<Row> = {
  header: string;
  cell: (row: Row) => string;
  maxWidth?: number;
  style?: DisplayTableColumnStyle;
  flex?: boolean;
};

export type DisplayTableOptions<Row> = {
  terminalWidth?: number;
  groupBy?: (row: Row) => string;
  horizontalScroll?: boolean;
};

export type DisplayBlock =
  | {
      kind: "rows";
      rows: readonly DisplayRow[];
    }
  | {
      kind: "table";
      table: DisplayTable;
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

export type DisplayTable<Row = unknown> = {
  rows: readonly Row[];
  columns: readonly DisplayTableColumn<Row>[];
  emptyMessage?: string;
  options?: DisplayTableOptions<Row>;
};

export function rows(rows: readonly DisplayRow[]): DisplayBlock {
  return { kind: "rows", rows };
}

export function table<Row>(displayTable: DisplayTable<Row>): DisplayBlock {
  return { kind: "table", table: displayTable as DisplayTable };
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
