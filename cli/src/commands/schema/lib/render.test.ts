import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { formatSchemaTree } from "@/commands/schema/lib/render.ts";
import {
  forceNoTerminalColorForTests,
  forceTerminalColorForTests,
  restoreTerminalState,
  snapshotTerminalState,
  type TerminalTestState,
} from "@/test-support/terminal-test-utils.ts";

const columns = [
  { name: "schema_name", type: "VARCHAR" },
  { name: "table_name", type: "VARCHAR" },
  { name: "table_comment", type: "VARCHAR" },
  { name: "column_name", type: "VARCHAR" },
  { name: "data_type", type: "VARCHAR" },
  { name: "is_nullable", type: "VARCHAR" },
  { name: "table_type", type: "VARCHAR" },
  { name: "comment", type: "VARCHAR" },
  { name: "ordinal_position", type: "INTEGER" },
];

const sampleResult = {
  metadata: {},
  columns,
  rows: [
    ["hello", null, null, null, null, null, null, null, 0],
    ["main", null, null, null, null, null, null, null, 0],
    ["main", "hello", null, "id", "INTEGER", "YES", "BASE TABLE", null, 1],
    ["main", "hello", null, "name", "VARCHAR", "YES", "BASE TABLE", null, 2],
    ["main", "hello", null, "created_at", "TIMESTAMP", "YES", "BASE TABLE", null, 3],
    ["main", "test", null, "id", "DECIMAL(18,3)", "YES", "BASE TABLE", null, 1],
  ],
};

describe("formatSchemaTree", () => {
  let terminalState: TerminalTestState;

  beforeAll(() => {
    terminalState = snapshotTerminalState();
    forceNoTerminalColorForTests();
  });

  afterAll(() => {
    restoreTerminalState(terminalState);
  });

  test("cascades catalog, schema, table, and columns with types", () => {
    expect(formatSchemaTree(sampleResult, "test_post_role")).toBe(
      [
        "Schemas and tables for test_post_role",
        "├── hello",
        "│   └── <no table>",
        "└── main",
        "    ├── hello",
        "    │   ├── id          INTEGER",
        "    │   ├── name        VARCHAR",
        "    │   └── created_at  TIMESTAMP",
        "    └── test",
        "        └── id  DECIMAL(18,3)",
      ].join("\n"),
    );
  });

  test("annotates views, non-nullable columns, and comments", () => {
    const tree = formatSchemaTree(
      {
        metadata: {},
        columns,
        rows: [["main", "v", "user view", "id", "INTEGER", "NO", "VIEW", "primary key", 1]],
      },
      "demo",
    );

    expect(tree).toBe(
      [
        "Schemas and tables for demo",
        "└── main",
        "    └── v (VIEW)  — user view",
        "        └── id  INTEGER NOT NULL  — primary key",
      ].join("\n"),
    );
  });

  test("reports an empty catalog", () => {
    expect(formatSchemaTree({ metadata: {}, columns, rows: [] }, "empty")).toBe(
      ["Schemas and tables for empty", "└── <no schema>"].join("\n"),
    );
  });

  test("preserves semantic color roles", () => {
    forceTerminalColorForTests();
    try {
      const tree = formatSchemaTree(sampleResult, "test_post_role");
      expect(tree).toContain("\u001b[1mSchemas and tables for test_post_role\u001b[22m");
      expect(tree).toContain("\u001b[96mmain\u001b[39m");
      expect(tree).toContain("\u001b[1mtest\u001b[22m");
      expect(tree).toContain("\u001b[33mINTEGER\u001b[39m");
      expect(tree).toContain("\u001b[90m<no table>\u001b[39m");
    } finally {
      forceNoTerminalColorForTests();
    }
  });
});
