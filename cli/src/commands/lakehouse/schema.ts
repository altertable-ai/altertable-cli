import type { ArgsDef } from "citty";
import { stringArg } from "@/lib/operation-codec.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { parseQueryOutputOptions, parseRequestReadTimeoutMs } from "@/commands/lakehouse-args.ts";
import {
  planQueryRun,
  presentQueryRun,
  queryRunArgs,
  type QueryRunInput,
} from "@/commands/lakehouse/query.ts";
import { getQueryColumnNames } from "@/lib/lakehouse-client.ts";
import { writePagedOutput } from "@/lib/pager.ts";
import {
  terminalAccent,
  terminalBoolean,
  terminalNumber,
  terminalStrong,
  terminalSubtle,
  terminalWarning,
} from "@/ui/terminal/styles.ts";
import type { LakehouseQueryResult, LakehouseRow } from "@/lib/lakehouse-ndjson.ts";

export function buildSchemaStatement(catalog: string): string {
  const catSql = `'${catalog.replaceAll("'", "''")}'`;
  return `SELECT schema_name, table_name, table_comment, column_name, data_type, is_nullable, table_type, comment, ordinal_position
FROM (
  SELECT s.schema_name, NULL AS table_name, NULL AS table_comment, NULL AS column_name, NULL AS data_type,
    NULL AS is_nullable, NULL AS table_type, NULL AS comment, 0 AS ordinal_position
    FROM duckdb_schemas() AS s
    WHERE s.database_name = ${catSql}
      AND NOT s.internal
  UNION ALL
  SELECT c.schema_name, c.table_name, t.comment AS table_comment, c.column_name, c.data_type,
    CASE WHEN c.is_nullable THEN 'YES' ELSE 'NO' END,
    CASE WHEN t.temporary THEN 'LOCAL TEMPORARY' ELSE 'BASE TABLE' END,
    c.comment,
    c.column_index
    FROM duckdb_columns() AS c
    INNER JOIN duckdb_tables() AS t
      ON c.database_name = t.database_name
      AND c.schema_name = t.schema_name
      AND c.table_name = t.table_name
    WHERE c.database_name = ${catSql}
      AND NOT c.internal
      AND NOT t.internal
  UNION ALL
  SELECT c.schema_name, c.table_name, v.comment AS table_comment, c.column_name, c.data_type,
    CASE WHEN c.is_nullable THEN 'YES' ELSE 'NO' END,
    'VIEW',
    c.comment,
    c.column_index
    FROM duckdb_columns() AS c
    INNER JOIN duckdb_views() AS v
      ON c.database_name = v.database_name
      AND c.schema_name = v.schema_name
      AND c.table_name = v.view_name
    WHERE c.database_name = ${catSql}
      AND NOT c.internal
      AND NOT v.internal
)
ORDER BY table_name ASC NULLS FIRST, ordinal_position ASC`;
}

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

const schemaArgs = {
  catalog: { type: "positional", description: "Catalog name", required: true },
  format: queryRunArgs.format,
  columns: queryRunArgs.columns,
  "max-width": queryRunArgs["max-width"],
  pager: queryRunArgs.pager,
  "read-timeout": queryRunArgs["read-timeout"],
} satisfies ArgsDef;

type SchemaRunInput = QueryRunInput & { catalog: string };

export const schemaCommand = defineOperationCommand<SchemaRunInput, LakehouseQueryResult>({
  id: "lakehouse.schema",
  capabilities: ["lakehouse-http", "streaming"],
  catalog: {
    effects: ["http", "http-stream"],
    planes: ["lakehouse"],
    output: "normalized",
  },
  meta: {
    name: "schema",
    description: "List schemas, tables, and columns for a catalog.",
    examples: ["altertable schema my-catalog", "altertable schema my-catalog --format json"],
  },
  args: schemaArgs,
  parse({ args, rawArgs }) {
    const catalog = stringArg(args, "catalog");
    // --layout is not supported: human output is always the schema tree.
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(
      { ...args, layout: undefined },
      rawArgs,
    );
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    return {
      catalog,
      statement: buildSchemaStatement(catalog),
      format,
      displayOptions,
      pagerOptions,
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
  },
  run: planQueryRun,
  async present(result, context, input) {
    if (input.format !== "human" || context.sink.json) {
      await presentQueryRun(result, context, input);
      return;
    }
    await writePagedOutput(
      formatSchemaTree(result, input.catalog),
      input.pagerOptions,
      context.sink,
    );
  },
});
