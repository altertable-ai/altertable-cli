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
import { writePagedOutput } from "@/lib/pager.ts";
import type { LakehouseQueryResult } from "@/lib/lakehouse-ndjson.ts";
import { formatSchemaTree } from "@/features/lakehouse/schema/render.ts";

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
