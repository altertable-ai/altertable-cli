import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";

const SCHEMA_COLUMNS = [
  "schema_name",
  "table_name",
  "table_comment",
  "column_name",
  "data_type",
  "is_nullable",
  "table_type",
  "comment",
  "ordinal_position",
];

let testHome = "";
let mockFile = "";
let logFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-schema-test-"));
  mockFile = join(testHome, "mocks.json");
  logFile = join(testHome, "http.log");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_HTTP_LOG = logFile;
  process.env.ALTERTABLE_API_BASE = "https://example.com";
  process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "testuser";
  process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "testpass";
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_HTTP_LOG;
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
});

function writeSchemaResponse(rows: unknown[][]): void {
  writeFileSync(
    mockFile,
    JSON.stringify([
      {
        urlPattern: "/query",
        method: "POST",
        body: [{ statement: "schema" }, SCHEMA_COLUMNS, ...rows]
          .map((line) => JSON.stringify(line))
          .join("\n"),
      },
    ]),
  );
}

describe("schema command", () => {
  test("sends one escaped catalog-scoped query", async () => {
    writeSchemaResponse([]);

    await runCommandWithTestRuntime(["schema", "o'brien", "--format", "json"]);

    const payloadLine = readFileSync(logFile, "utf8")
      .split("\n")
      .find((line) => line.startsWith("PAYLOAD="));
    const payload = JSON.parse(payloadLine?.slice("PAYLOAD=".length) ?? "") as {
      statement: string;
    };
    expect(payload.statement.match(/database_name = 'o''brien'/g)).toHaveLength(3);
    expect(payload.statement).toContain("duckdb_schemas()");
    expect(payload.statement).toContain("duckdb_tables()");
    expect(payload.statement).toContain("duckdb_views()");
  });

  test("renders schemas, tables, columns, types, and comments", async () => {
    writeSchemaResponse([
      ["main", null, null, null, null, null, null, null, 0],
      ["main", "users", "user table", "id", "INTEGER", "NO", "BASE TABLE", "primary key", 1],
      ["main", "users", "user table", "name", "VARCHAR", "YES", "BASE TABLE", null, 2],
    ]);

    const result = await runCommandWithTestRuntime(["schema", "analytics"], {
      debug: false,
      json: false,
      agent: false,
    });

    expect(result.stdout.join("\n")).toBe(
      [
        "Schemas and tables for analytics",
        "└── main",
        "    └── users  — user table",
        "        ├── id    INTEGER NOT NULL  — primary key",
        "        └── name  VARCHAR",
      ].join("\n"),
    );
  });

  test("rejects query layout flags because human output is always the tree", () => {
    const result = runCommandWithTestRuntime(["schema", "analytics", "--layout", "line"]);
    return expect(result).rejects.toThrow();
  });
});
