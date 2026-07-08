import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import {
  parseAppendJsonContent,
  parsePagerOptions,
  parseQueryDisplayOptions,
  parseQueryOutputOptions,
  parseQueryLayout,
  parseQueryResultFormatArg,
  parseLakehouseFileContentType,
} from "@/commands/lakehouse-args.ts";
import { parseQueryResultFormat } from "@/lib/lakehouse-client.ts";
import { buildSchemaStatement, schemaCommand } from "@/commands/lakehouse/schema.ts";
import { formatSchemaTree } from "@/features/lakehouse/schema/render.ts";
import { setCliContext } from "@/context.ts";
import {
  forceNoTerminalColorForTests,
  forceTerminalColorForTests,
  restoreTerminalState,
  snapshotTerminalState,
  type TerminalTestState,
} from "@tests/terminal-test-utils.ts";

describe("parseQueryDisplayOptions", () => {
  test("parses human layout values", () => {
    const options = parseQueryDisplayOptions({ layout: "line" }, []);
    expect(options.layout).toBe("line");
  });

  test("parses max width", () => {
    const options = parseQueryDisplayOptions({ "max-width": "24" }, []);
    expect(options.maxColumnWidth).toBe(24);
  });
});

describe("parseQueryLayout", () => {
  test("parses auto, table, and line", () => {
    expect(parseQueryLayout({ layout: "auto" })).toBe("auto");
    expect(parseQueryLayout({ layout: "table" })).toBe("table");
    expect(parseQueryLayout({ layout: "line" })).toBe("line");
  });

  test("rejects unknown layout values", () => {
    expect(() => parseQueryLayout({ layout: "expanded" })).toThrow(CliError);
  });
});

describe("parseQueryResultFormat", () => {
  test("parses query result formats", () => {
    expect(parseQueryResultFormat("human")).toBe("human");
    expect(parseQueryResultFormat("json")).toBe("json");
    expect(parseQueryResultFormat("csv")).toBe("csv");
    expect(parseQueryResultFormat("markdown")).toBe("markdown");
  });

  test("rejects unknown query result formats", () => {
    expect(() => parseQueryResultFormat("duckbox")).toThrow(CliError);
  });
});

describe("parseQueryResultFormatArg", () => {
  test("defaults to json when --agent is set", () => {
    setCliContext({ debug: false, json: false, agent: true });
    expect(parseQueryResultFormatArg({}, [])).toBe("json");
    setCliContext({ debug: false, json: false, agent: false });
  });

  test("rejects human-only flags with --agent", () => {
    setCliContext({ debug: false, json: false, agent: true });
    expect(() => parseQueryResultFormatArg({}, ["--layout", "table"])).toThrow(CliError);
    expect(() => parseQueryResultFormatArg({}, ["--pager", "never"])).toThrow(CliError);
    expect(() => parseQueryResultFormatArg({}, ["--max-width", "32"])).toThrow(CliError);
    setCliContext({ debug: false, json: false, agent: false });
  });
});

describe("parsePagerOptions", () => {
  test("parses pager enum values", () => {
    expect(parsePagerOptions({ pager: "never" })).toEqual({ mode: "never" });
  });

  test("rejects unknown pager values", () => {
    expect(() => parsePagerOptions({ pager: "sometimes" })).toThrow(CliError);
  });

  test("forces never pager in agent mode", () => {
    setCliContext({ debug: false, json: false, agent: true });
    expect(parsePagerOptions({})).toEqual({ mode: "never" });
    setCliContext({ debug: false, json: false, agent: false });
  });
});

describe("parseQueryOutputOptions", () => {
  test("composes query output settings from one validation pass", () => {
    const options = parseQueryOutputOptions(
      { format: "markdown", layout: "line", "max-width": "24", pager: "never" },
      [],
    );
    expect(options.format).toBe("markdown");
    expect(options.displayOptions.layout).toBe("line");
    expect(options.displayOptions.maxColumnWidth).toBe(24);
    expect(options.pagerOptions).toEqual({ mode: "never" });
  });
});

describe("buildSchemaStatement", () => {
  test("interpolates the catalog as a SQL string literal at every filter site", () => {
    const statement = buildSchemaStatement("analytics");
    expect(statement.match(/database_name = 'analytics'/g)).toHaveLength(3);
    expect(statement).toContain("duckdb_schemas()");
    expect(statement).toContain("duckdb_tables()");
    expect(statement).toContain("duckdb_views()");
  });

  test("escapes single quotes in the catalog name", () => {
    const statement = buildSchemaStatement("o'brien");
    expect(statement).toContain("database_name = 'o''brien'");
    expect(statement).not.toContain("'o'brien'");
  });
});

describe("schemaCommand", () => {
  test("does not expose --layout (human output is always the tree)", () => {
    expect(Object.keys(schemaCommand.args ?? {})).not.toContain("layout");
  });
});

describe("formatSchemaTree", () => {
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

  test("reports when the catalog has no schemas", () => {
    expect(formatSchemaTree({ metadata: {}, columns, rows: [] }, "empty")).toBe(
      ["Schemas and tables for empty", "└── <no schema>"].join("\n"),
    );
  });

  test("colorizes schema, table, and type labels when color is enabled", () => {
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

describe("parseAppendJsonContent", () => {
  test("rejects data not starting with object or array", () => {
    expect(() => parseAppendJsonContent("not-json")).toThrow(CliError);
  });

  test("rejects @missing.json file paths", () => {
    expect(() => parseAppendJsonContent("@/no/such/missing.json")).toThrow(CliError);
    expect(() => parseAppendJsonContent("@/no/such/missing.json")).toThrow(/File not found/);
  });

  test("accepts inline JSON objects", () => {
    expect(parseAppendJsonContent('{"id":1}')).toBe('{"id":1}');
  });
});

describe("parseLakehouseFileContentType", () => {
  test("maps supported lakehouse file formats to content types", () => {
    expect(parseLakehouseFileContentType(undefined)).toBeUndefined();
    expect(parseLakehouseFileContentType("csv")).toBe("text/csv");
    expect(parseLakehouseFileContentType("json")).toBe("application/json");
    expect(parseLakehouseFileContentType("parquet")).toBe("application/vnd.apache.parquet");
  });

  test("rejects unknown lakehouse file formats", () => {
    expect(() => parseLakehouseFileContentType("xml")).toThrow(CliError);
    expect(() => parseLakehouseFileContentType("xml")).toThrow(
      "--format must be one of: csv, json, parquet",
    );
  });
});
