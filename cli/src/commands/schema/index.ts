import { stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { parseQueryOutputOptions } from "@/lib/query-output-args.ts";
import { parseRequestReadTimeoutMs } from "@/lib/timeout-args.ts";
import { writePagedOutput } from "@/lib/pager.ts";
import { writeQueryOutput } from "@/lib/lakehouse-client.ts";
import { executeLakehouseQuery } from "@/lib/lakehouse/query.ts";
import { buildSchemaTreeView } from "@/commands/schema/lib/views.ts";
import { schemaArgs } from "@/commands/schema/lib/args.ts";
import { renderTreeText } from "@/ui/renderers/terminal.ts";

export const schemaCommand = defineCommand({
  meta: {
    name: "schema",
    commandGroup: "query",
    description: "List schemas, tables, and columns for a catalog.",
    examples: ["altertable schema my-catalog", "altertable schema my-catalog --format json"],
  },
  args: schemaArgs,
  async run({ args, rawArgs, execution, sink }) {
    const catalog = stringArg(args, "catalog");
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, {
      agent: execution.cli.agent,
      rawArgs,
    });
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const queryInput = {
      statement: buildSchemaStatement(catalog),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
    const result = await executeLakehouseQuery(
      queryInput,
      execution,
      format !== "json" && !sink.json,
    );
    if (format !== "human" || sink.json) {
      await writeQueryOutput(result, format, sink, displayOptions, pagerOptions);
      return;
    }
    await writePagedOutput(
      renderTreeText(buildSchemaTreeView(result, catalog)),
      pagerOptions,
      sink,
    );
  },
});

function buildSchemaStatement(catalog: string): string {
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
