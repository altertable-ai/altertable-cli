export type DisplayTextStyle =
  | "strong"
  | "accent"
  | "string"
  | "boolean"
  | "number"
  | "muted"
  | "subtle"
  | "success"
  | "warning"
  | "error"
  | "heading"
  | "httpMethod";

export type DisplaySpan = {
  text: string;
  style?: DisplayTextStyle;
  href?: string;
};

export type DisplayText = string | readonly DisplaySpan[];

export type DisplayRow = {
  label: string;
  value: DisplayText;
  level?: 0 | 1;
};

export type DisplayTableColumn<Row> = {
  header: string;
  cell: (row: Row) => DisplayText;
  maxWidth?: number;
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
      lines: readonly DisplayText[];
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

export function text(lines: readonly DisplayText[]): DisplayBlock {
  return { kind: "text", lines };
}

export function span(text: string, style?: DisplayTextStyle, href?: string): DisplaySpan {
  return {
    text,
    ...(style ? { style } : {}),
    ...(href ? { href } : {}),
  };
}

export function displayTextContent(text: DisplayText): string {
  return typeof text === "string" ? text : text.map((item) => item.text).join("");
}

export function section(...blocks: readonly DisplayBlock[]): DisplaySection {
  return { blocks };
}

export function document(...sections: readonly DisplaySection[]): DisplayDocument {
  return { sections };
}
