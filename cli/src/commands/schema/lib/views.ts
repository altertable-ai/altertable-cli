import { getQueryColumnNames } from "@/lib/query-format.ts";
import type { LakehouseQueryResult, LakehouseRow } from "@/lib/lakehouse-ndjson.ts";
import type { TreeNode, TreeView } from "@/ui/layouts/tree.ts";
import { span, type DisplaySpan } from "@/ui/document.ts";

type SchemaTreeColumn = {
  name: string;
  dataType: string;
  nullable: string | null;
  comment: string | null;
};

type SchemaTreeTable = {
  type: string | null;
  comment: string | null;
  columns: SchemaTreeColumn[];
};

function resultCell(
  row: LakehouseRow,
  name: string,
  columnIndex: ReadonlyMap<string, number>,
): unknown {
  return Array.isArray(row) ? row[columnIndex.get(name) ?? -1] : row[name];
}

function textCell(
  row: LakehouseRow,
  name: string,
  columnIndex: ReadonlyMap<string, number>,
): string | null {
  const value = resultCell(row, name, columnIndex);
  return typeof value === "string" ? value : null;
}

function buildSchemaMap(result: LakehouseQueryResult): Map<string, Map<string, SchemaTreeTable>> {
  const columnIndex = new Map(getQueryColumnNames(result).map((name, index) => [name, index]));
  const schemas = new Map<string, Map<string, SchemaTreeTable>>();

  for (const row of result.rows) {
    const schemaName = textCell(row, "schema_name", columnIndex);
    if (schemaName === null) {
      continue;
    }

    let tables = schemas.get(schemaName);
    if (!tables) {
      tables = new Map();
      schemas.set(schemaName, tables);
    }

    const tableName = textCell(row, "table_name", columnIndex);
    if (tableName === null) {
      continue;
    }

    let table = tables.get(tableName);
    if (!table) {
      table = {
        type: textCell(row, "table_type", columnIndex),
        comment: textCell(row, "table_comment", columnIndex),
        columns: [],
      };
      tables.set(tableName, table);
    }

    const columnName = textCell(row, "column_name", columnIndex);
    if (columnName !== null) {
      table.columns.push({
        name: columnName,
        dataType: textCell(row, "data_type", columnIndex) ?? "",
        nullable: textCell(row, "is_nullable", columnIndex),
        comment: textCell(row, "comment", columnIndex),
      });
    }
  }

  return schemas;
}

function schemaColumnNode(column: SchemaTreeColumn, nameWidth: number): TreeNode {
  const label: DisplaySpan[] = [
    span(column.name.padEnd(nameWidth)),
    span("  "),
    span(column.dataType, "number"),
  ];
  if (column.nullable === "NO") {
    label.push(span(" "), span("NOT NULL", "boolean"));
  }
  if (column.comment) {
    label.push(span("  "), span(`— ${column.comment}`, "subtle"));
  }
  return {
    label,
  };
}

function schemaTableNode(tableName: string, table: SchemaTreeTable): TreeNode {
  const nameWidth = Math.max(0, ...table.columns.map((column) => column.name.length));
  const label: DisplaySpan[] = [span(tableName, "strong")];
  if (table.type && table.type !== "BASE TABLE") {
    label.push(span(" "), span(`(${table.type})`, "warning"));
  }
  if (table.comment) {
    label.push(span("  "), span(`— ${table.comment}`, "subtle"));
  }

  return {
    label,
    children: table.columns.map((column) => schemaColumnNode(column, nameWidth)),
  };
}

function schemaNode(
  schemaName: string,
  tables: ReadonlyMap<string, SchemaTreeTable> | undefined,
): TreeNode {
  const tableEntries = tables ? [...tables] : [];

  return {
    label: [span(schemaName, "accent")],
    emptyLabel: [span("<no table>", "subtle")],
    children: tableEntries.map(([tableName, table]) => schemaTableNode(tableName, table)),
  };
}

export function buildSchemaTreeView(result: LakehouseQueryResult, catalog: string): TreeView {
  const schemas = buildSchemaMap(result);

  return {
    title: [span(`Schemas and tables for ${catalog}`, "strong")],
    emptyLabel: [span("<no schema>", "subtle")],
    children: [...schemas.keys()]
      .sort()
      .map((schemaName) => schemaNode(schemaName, schemas.get(schemaName))),
  };
}
