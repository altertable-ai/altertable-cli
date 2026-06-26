import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configSet } from "@/lib/config.ts";
import { parseLakehouseQueryResponse } from "@/lib/lakehouse-client.ts";
import {
  defaultDisplayOptions,
  formatQueryCell,
  highlightJsonForTerminal,
  renderQueryFooter,
  renderQueryHumanOutput,
  renderQueryMarkdown,
  selectColumnNames,
  truncateText,
} from "@/lib/query-format.ts";
import { renderQueryCsv, renderQueryJson } from "@/lib/lakehouse-client.ts";

const SAMPLE_NDJSON = [
  '{"statement":"SELECT 1","session_id":"abc","query_id":"def"}',
  '["id","name"]',
  '[1,"Alice"]',
  '[2,"Bob"]',
].join("\n");

const WIDE_RESULT = {
  metadata: { init_time_ms: 285, query_id: "019ee8e4-1d79-77d9-8693-1f67732b184d" },
  columns: ["uuid", "event", "input", "timestamp", "success", "duration"],
  rows: [
    {
      uuid: "019ee8e4-1d79-77d9-8693-1f67732b184d",
      event: "list_catalogs",
      input: '{"filter":"all","include_metadata":true}',
      timestamp: "2026-06-25T12:00:00Z",
      success: true,
      duration: 42,
    },
  ],
};

describe("truncateText", () => {
  test("truncates long strings with ellipsis", () => {
    expect(truncateText("hello world", 8)).toBe("hello w…");
  });
});

describe("formatQueryCell", () => {
  test("renders NULL for null values", () => {
    expect(formatQueryCell(null, { expanded: false })).toBe("NULL");
    expect(formatQueryCell(undefined, { expanded: false })).toBe("NULL");
  });

  test("shortens UUID strings in table mode", () => {
    const uuid = "019ee8e4-1d79-77d9-8693-1f67732b184d";
    expect(formatQueryCell(uuid, { expanded: false })).toBe("019ee8e4…184d");
    expect(formatQueryCell(uuid, { expanded: true })).toBe(uuid);
  });
});

describe("selectColumnNames", () => {
  test("filters to requested columns in order", () => {
    expect(selectColumnNames(["uuid", "event", "timestamp"], ["event", "uuid"])).toEqual([
      "event",
      "uuid",
    ]);
  });

  test("falls back to all columns when filter matches nothing", () => {
    expect(selectColumnNames(["uuid", "event"], ["missing"])).toEqual(["uuid", "event"]);
  });
});

describe("renderQueryHumanOutput", () => {
  const parsedResult = parseLakehouseQueryResponse(SAMPLE_NDJSON);

  test("narrow table unchanged for Alice/Bob sample", () => {
    const output = renderQueryHumanOutput(parsedResult, {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth: 80,
    });
    expect(output).toContain("id");
    expect(output).toContain("name");
    expect(output).toContain("Alice");
    expect(output).toContain("Bob");
  });

  test("truncates long string columns in table layout", () => {
    const result = {
      metadata: {},
      columns: ["label"],
      rows: [{ label: "abcdefghijklmnopqrstuvwxyz" }],
    };
    const output = renderQueryHumanOutput(result, {
      layout: "table",
      maxColumnWidth: 10,
      terminalWidth: 80,
    });
    expect(output).toContain("abcdefghi…");
    expect(output).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  test("auto layout picks expanded when wider than terminal", () => {
    const output = renderQueryHumanOutput(WIDE_RESULT, {
      layout: "auto",
      maxColumnWidth: 32,
      terminalWidth: 60,
    });
    expect(output).toContain("-[ record 1 ]-");
  });

  test("auto layout picks table when terminal is wide enough", () => {
    const output = renderQueryHumanOutput(WIDE_RESULT, {
      layout: "auto",
      maxColumnWidth: 32,
      terminalWidth: 200,
    });
    expect(output).toContain("uuid");
    expect(output).toContain("event");
    expect(output).not.toContain("-[ record 1 ]-");
  });

  test("column selection filters displayed columns", () => {
    const output = renderQueryHumanOutput(WIDE_RESULT, {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth: 200,
      columns: ["uuid", "event"],
    });
    expect(output).toContain("uuid");
    expect(output).toContain("event");
    expect(output).not.toContain("input");
    expect(output).not.toContain("timestamp");
  });
});

describe("renderQueryFooter", () => {
  test("includes row count, timing, and query_id", () => {
    const footer = renderQueryFooter({
      metadata: { init_time_ms: 285, query_id: "019ee8e4-1d79-77d9-8693-1f67732b184d" },
      columns: [],
      rows: [{ id: 1 }, { id: 2 }],
    });
    expect(footer).toContain("2 rows in 285ms");
    expect(footer).toContain("query_id:");
    expect(footer).toContain("019ee8e4…184d");
  });
});

describe("CSV regression", () => {
  test("renderQueryCsv keeps full JSON without ellipsis", () => {
    const result = {
      metadata: {},
      columns: ["payload"],
      rows: [{ payload: { key: "value", nested: { deep: true } } }],
    };
    const csv = renderQueryCsv(result);
    const dataLine = csv.split("\n")[1] ?? "";
    const unquoted = dataLine.slice(1, -1).replace(/""/g, '"');
    expect(unquoted).toBe('{"key":"value","nested":{"deep":true}}');
    expect(csv).not.toContain("…");
  });
});

describe("renderQueryMarkdown", () => {
  test("renders GitHub-flavored pipe table with full values", () => {
    const result = {
      metadata: { init_time_ms: 285 },
      columns: ["id", "name"],
      rows: [{ id: 1, name: "Alice" }],
    };
    const output = renderQueryMarkdown(result, ["id", "name"], {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth: 80,
    });
    expect(output).toContain("| id | name |");
    expect(output).toContain("| --- | --- |");
    expect(output).toContain("| 1 | Alice |");
    expect(output).toContain("<!-- 1 row in 285ms -->");
  });

  test("escapes pipe characters in cells", () => {
    const result = {
      metadata: {},
      columns: ["label"],
      rows: [{ label: "a|b" }],
    };
    const output = renderQueryMarkdown(result, ["label"], {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth: 80,
    });
    expect(output).toContain("a\\|b");
  });
});

describe("highlightJsonForTerminal", () => {
  test("returns input unchanged when disabled", () => {
    const json = '{"key":"value","count":42}';
    const output = highlightJsonForTerminal(json, false);
    expect(output).toBe(json);
    expect(output).not.toContain("\u001b");
  });

  test("adds ANSI codes when enabled", () => {
    const json = '{"key":"value","count":42}';
    const output = highlightJsonForTerminal(json, true);
    expect(output).toContain("\u001b[36m");
    expect(output).toContain("\u001b[32m");
    expect(output).toContain("\u001b[33m");
  });
});

describe("JSON regression", () => {
  test("renderQueryJson keeps full values without ANSI", () => {
    const result = {
      metadata: {},
      columns: ["payload"],
      rows: [{ payload: { key: "value" } }],
    };
    const json = renderQueryJson(result);
    expect(json).toContain('"key": "value"');
    expect(json).not.toContain("\u001b");
  });
});

describe("defaultDisplayOptions", () => {
  let testHome = "";

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "altertable-query-format-test-"));
    process.env.ALTERTABLE_CONFIG_HOME = testHome;
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
    delete process.env.ALTERTABLE_CONFIG_HOME;
  });

  test("merges config defaults when present", () => {
    configSet("query_max_col_width", "24");
    configSet("query_layout", "table");
    const options = defaultDisplayOptions();
    expect(options.maxColumnWidth).toBe(24);
    expect(options.layout).toBe("table");
  });
});
