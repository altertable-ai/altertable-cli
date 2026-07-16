import { describe, expect, test } from "bun:test";
import { buildSchemaStatement, schemaCommand } from "@/commands/schema/index.ts";

describe("schemaCommand", () => {
  test("keeps human output on the schema tree by omitting --layout", () => {
    expect(Object.keys(schemaCommand.args ?? {})).not.toContain("layout");
  });

  test("builds one catalog-scoped query for schemas, tables, and views", () => {
    const statement = buildSchemaStatement("analytics");
    expect(statement.match(/database_name = 'analytics'/g)).toHaveLength(3);
    expect(statement).toContain("duckdb_schemas()");
    expect(statement).toContain("duckdb_tables()");
    expect(statement).toContain("duckdb_views()");
  });

  test("escapes the catalog SQL string literal", () => {
    const statement = buildSchemaStatement("o'brien");
    expect(statement).toContain("database_name = 'o''brien'");
    expect(statement).not.toContain("'o'brien'");
  });
});
