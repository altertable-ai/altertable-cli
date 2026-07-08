import { getQueryColumnNames } from "@/lib/lakehouse-client.ts";
import type { LakehouseQueryResult, LakehouseRow } from "@/lib/lakehouse-ndjson.ts";
import {
  terminalAccent,
  terminalBoolean,
  terminalNumber,
  terminalStrong,
  terminalSubtle,
  terminalWarning,
} from "@/ui/terminal/styles.ts";

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

export function formatSchemaTree(result: LakehouseQueryResult, catalog: string): string {
  const columnIndex = new Map(getQueryColumnNames(result).map((name, i) => [name, i]));
  const cell = (row: LakehouseRow, name: string): unknown =>
    Array.isArray(row) ? row[columnIndex.get(name) ?? -1] : row[name];
  const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

  const schemas = new Map<string, Map<string, SchemaTreeTable>>();
  for (const row of result.rows) {
    const schemaName = text(cell(row, "schema_name"));
    if (schemaName === null) {
      continue;
    }
    let tables = schemas.get(schemaName);
    if (!tables) {
      tables = new Map();
      schemas.set(schemaName, tables);
    }

    const tableName = text(cell(row, "table_name"));
    if (tableName === null) {
      continue;
    }
    let table = tables.get(tableName);
    if (!table) {
      table = {
        type: text(cell(row, "table_type")),
        comment: text(cell(row, "table_comment")),
        columns: [],
      };
      tables.set(tableName, table);
    }

    const columnName = text(cell(row, "column_name"));
    if (columnName !== null) {
      table.columns.push({
        name: columnName,
        dataType: text(cell(row, "data_type")) ?? "",
        nullable: text(cell(row, "is_nullable")),
        comment: text(cell(row, "comment")),
      });
    }
  }

  const lines: string[] = [terminalStrong(`Schemas and tables for ${catalog}`)];
  const schemaNames = [...schemas.keys()].sort();
  if (schemaNames.length === 0) {
    lines.push(`└── ${terminalSubtle("<no schema>")}`);
    return lines.join("\n");
  }

  schemaNames.forEach((schemaName, schemaIdx) => {
    const isLastSchema = schemaIdx === schemaNames.length - 1;
    lines.push(`${isLastSchema ? "└── " : "├── "}${terminalAccent(schemaName)}`);
    const schemaIndent = isLastSchema ? "    " : "│   ";

    const tables = [...(schemas.get(schemaName) ?? new Map<string, SchemaTreeTable>())];
    if (tables.length === 0) {
      lines.push(`${schemaIndent}└── ${terminalSubtle("<no table>")}`);
      return;
    }

    tables.forEach(([tableName, table], tableIdx) => {
      const isLastTable = tableIdx === tables.length - 1;
      const typeSuffix =
        table.type && table.type !== "BASE TABLE" ? ` ${terminalWarning(`(${table.type})`)}` : "";
      const tableComment = table.comment ? `  ${terminalSubtle(`— ${table.comment}`)}` : "";
      lines.push(
        `${schemaIndent}${isLastTable ? "└── " : "├── "}${terminalStrong(tableName)}${typeSuffix}${tableComment}`,
      );

      const columnIndent = `${schemaIndent}${isLastTable ? "    " : "│   "}`;
      const nameWidth = Math.max(0, ...table.columns.map((column) => column.name.length));
      table.columns.forEach((column, columnIdx) => {
        const branch = columnIdx === table.columns.length - 1 ? "└── " : "├── ";
        const notNull = column.nullable === "NO" ? ` ${terminalBoolean("NOT NULL")}` : "";
        const columnComment = column.comment ? `  ${terminalSubtle(`— ${column.comment}`)}` : "";
        lines.push(
          `${columnIndent}${branch}${column.name.padEnd(nameWidth)}  ${terminalNumber(column.dataType)}${notNull}${columnComment}`,
        );
      });
    });
  });

  return lines.join("\n");
}
