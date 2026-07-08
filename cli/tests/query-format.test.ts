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
  truncateTextMiddle,
} from "@/lib/query-format.ts";
import { renderQueryCsv, renderQueryJson } from "@/lib/lakehouse-client.ts";
import { getVisibleTextWidth } from "@/ui/terminal/styles.ts";
import {
  forceTerminalColorForTests,
  restoreTerminalState,
  snapshotTerminalState,
  type TerminalTestState,
} from "@tests/terminal-test-utils.ts";

let terminalState: TerminalTestState | undefined;

function enableTerminalColorForTests(): void {
  terminalState = snapshotTerminalState();
  forceTerminalColorForTests();
}

function restoreTerminalColorForTests(): void {
  if (terminalState === undefined) {
    return;
  }
  restoreTerminalState(terminalState);
  terminalState = undefined;
}

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

const AGENT_EVENTS_RESULT = {
  metadata: { init_time_ms: 137 },
  columns: [
    "uuid",
    "event",
    "timestamp",
    "duration_ms",
    "success",
    "error_message",
    "author_type",
    "author_id",
    "tool_name",
    "input",
  ],
  rows: [
    {
      uuid: "019ee8e4-1d79-77d9-8693-1f67732b184d",
      event: "mcp_tool_call",
      timestamp: "2026-06-21T06:35:24.409Z",
      duration_ms: 285,
      success: true,
      error_message: null,
      author_type: "Agent",
      author_id: "019c6610-ebab-784d-b72b-b89c44804e38",
      tool_name: "list_catalogs",
      input: '{"catalog_names":["altertable","sample_data"],"level":"overview"}',
    },
  ],
};

describe("truncateText", () => {
  test("truncates long strings with ellipsis", () => {
    expect(truncateText("hello world", 8)).toBe("hello w…");
  });

  test("truncates middle of long strings with ellipsis", () => {
    expect(truncateTextMiddle("019ee8e4-1d79-77d9-8693-1f67732b184d", 16)).toBe("019ee8e4…32b184d");
    expect(truncateTextMiddle("abcdef", 2)).toBe("a…");
  });
});

describe("formatQueryCell", () => {
  test("renders NULL for null values", () => {
    expect(formatQueryCell(null, {})).toBe("NULL");
    expect(formatQueryCell(undefined, {})).toBe("NULL");
  });

  test("shows full UUID strings without maxWidth", () => {
    const uuid = "019ee8e4-1d79-77d9-8693-1f67732b184d";
    expect(formatQueryCell(uuid, {})).toBe(uuid);
    expect(formatQueryCell(uuid, { maxWidth: 16 })).toBe(truncateTextMiddle(uuid, 16));
  });

  test("truncates long JSON strings when maxWidth is set", () => {
    const json = '{"catalog_names":["altertable","sample_data"],"level":"overview"}';
    expect(formatQueryCell(json, {})).toBe(json);
    expect(formatQueryCell(json, { maxWidth: 20 })).toBe(truncateText(json, 20));
  });

  test("keeps short JSON objects intact when truncated", () => {
    expect(formatQueryCell("{}", { maxWidth: 10 })).toBe("{}");
  });

  test("appends relative time to timestamps while keeping absolute form", () => {
    const timestamp = "2026-06-21T06:35:24.409Z";
    const nowMs = Date.parse("2026-06-27T12:00:00.000Z");
    const originalNow = Date.now;
    Date.now = () => nowMs;
    try {
      expect(formatQueryCell(timestamp, { includeRelative: true })).toBe(`${timestamp} 6 days ago`);
      expect(formatQueryCell(timestamp, {})).toBe(timestamp);
    } finally {
      Date.now = originalNow;
    }
  });

  test("replaces partial password masking with a fixed placeholder", () => {
    const requestedBy = "password:************************************************dfcd8";
    expect(formatQueryCell(requestedBy, {})).toBe("password: [MASKED]");
    expect(formatQueryCell(requestedBy, { colorize: false })).toBe("password: [MASKED]");
  });

  test("dims false and empty string values when colorized", () => {
    enableTerminalColorForTests();
    try {
      expect(formatQueryCell(false, { colorize: true })).toContain("\u001b[90m");
      expect(formatQueryCell(true, { colorize: true })).toContain("\u001b[35m");
      expect(formatQueryCell("", { colorize: true })).toContain("\u001b[90m");
    } finally {
      restoreTerminalColorForTests();
    }
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
  let savedNoColor: string | undefined;

  beforeEach(() => {
    savedNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
  });

  afterEach(() => {
    if (savedNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = savedNoColor;
    }
  });

  test("narrow table unchanged for Alice/Bob sample", () => {
    const output = renderQueryHumanOutput(parsedResult, {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth: 80,
    });
    expect(output).toContain("┌");
    expect(output).toContain("│");
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

  test("truncates UUID columns from the middle in table layout", () => {
    const output = renderQueryHumanOutput(
      {
        metadata: {},
        columns: ["uuid"],
        rows: [{ uuid: "019ee8e4-1d79-77d9-8693-1f67732b184d" }],
      },
      {
        layout: "table",
        maxColumnWidth: 16,
        terminalWidth: 80,
        colorize: false,
      },
    );
    expect(output).toContain("019ee8e4…32b184d");
  });

  test("right-aligns numeric columns in table layout", () => {
    const result = {
      metadata: {},
      columns: ["event", "duration_ms"],
      rows: [{ event: "query", duration_ms: 42 }],
    };
    const output = renderQueryHumanOutput(result, {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth: 80,
    });
    expect(output).toContain("│ query │          42 │");
  });

  test("auto layout picks line output when wider than terminal", () => {
    const output = renderQueryHumanOutput(WIDE_RESULT, {
      layout: "auto",
      maxColumnWidth: 32,
      terminalWidth: 60,
    });
    expect(output).not.toContain("-[ record 1 ]-");
    expect(output).toContain("event:");
    expect(output).toContain("list_catalogs");
  });

  test("box mode renders wider than the terminal for horizontal scrolling", () => {
    const terminalWidth = 60;
    const output = renderQueryHumanOutput(AGENT_EVENTS_RESULT, {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth,
      colorize: false,
    });
    expect(output).toContain("┌");
    expect(output.split("\n").some((line) => line.length > terminalWidth)).toBe(true);
  });

  test("auto layout picks table output when terminal is wide enough", () => {
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

  test("shows all columns by default on wide results", () => {
    const output = renderQueryHumanOutput(AGENT_EVENTS_RESULT, {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth: 200,
    });
    expect(output).toContain("event");
    expect(output).toContain("tool_name");
    expect(output).toContain("author_id");
    expect(output).not.toContain("columns hidden");
  });

  test("renders all columns in table layout when terminal is wide enough", () => {
    const terminalWidth = 400;
    const output = renderQueryHumanOutput(AGENT_EVENTS_RESULT, {
      layout: "table",
      maxColumnWidth: 32,
      terminalWidth,
    });
    expect(output).toContain("tool_name");
    expect(output).toContain("author_id");
    for (const line of output.split("\n")) {
      expect(getVisibleTextWidth(line)).toBeLessThanOrEqual(terminalWidth);
    }
  });

  test("line mode shows full values", () => {
    const output = renderQueryHumanOutput(AGENT_EVENTS_RESULT, {
      layout: "line",
      maxColumnWidth: 32,
      terminalWidth: 120,
    });
    expect(output).toContain("author_id");
    expect(output).toContain("catalog_names");
  });

  test("line mode includes relative timestamps", () => {
    const timestamp = "2026-06-21T06:35:24.409Z";
    const nowMs = Date.parse("2026-06-27T12:00:00.000Z");
    const originalNow = Date.now;
    Date.now = () => nowMs;
    try {
      const output = renderQueryHumanOutput(
        {
          metadata: {},
          columns: ["event", "timestamp"],
          rows: [{ event: "mcp_tool_call", timestamp }],
        },
        {
          layout: "line",
          maxColumnWidth: 80,
          terminalWidth: 120,
        },
      );
      expect(output).toContain(`${timestamp} 6 days ago`);
    } finally {
      Date.now = originalNow;
    }
  });

  test("colorizes line-mode labels and values when enabled", () => {
    enableTerminalColorForTests();
    try {
      const output = renderQueryHumanOutput(WIDE_RESULT, {
        layout: "line",
        maxColumnWidth: 32,
        terminalWidth: 80,
        colorize: true,
      });
      expect(output).toContain("\u001b[2m");
      expect(output).toContain("\u001b[35m");
      expect(output).toContain("\u001b[33m");
      expect(output).toContain("\u001b[34m");
      expect(output).toContain("\u001b[96m");
      expect(output).toContain("\u001b[90m");
      expect(output).toContain("event");
      expect(output).toContain("list_catalogs");
    } finally {
      restoreTerminalColorForTests();
    }
  });

  test("keeps array row values aligned when columns are filtered", () => {
    const result = {
      metadata: {},
      columns: ["uuid", "event", "timestamp", "author_id", "input"],
      rows: [
        [
          "019ee8e4-1d79-77d9-8693-1f67732b184d",
          "mcp_tool_call",
          "2026-06-21T06:35:24.409Z",
          "019c6610-ebab-784d-b72b-b89c44804e38",
          "{}",
        ],
      ],
    };
    const output = renderQueryHumanOutput(result, {
      layout: "line",
      maxColumnWidth: 80,
      terminalWidth: 120,
    });
    expect(output).toContain("event:");
    expect(output).toContain("mcp_tool_call");
    expect(output).toContain("timestamp:");
    expect(output).toContain("2026-06-21T06:35:24.409Z");
    expect(output).not.toMatch(/event:.*019ee8e4/);
  });

  test("uses row number separators instead of blank lines for multiple line-mode rows", () => {
    const result = {
      metadata: {},
      columns: ["event", "timestamp", "tool_name"],
      rows: [
        {
          event: "mcp_tool_call",
          timestamp: "2026-06-21T06:35:24.409Z",
          tool_name: "list_catalogs",
        },
        { event: "mcp_tool_call", timestamp: "2026-06-21T06:35:25.518Z", tool_name: "get_catalog" },
      ],
    };
    const output = renderQueryHumanOutput(result, {
      layout: "line",
      maxColumnWidth: 80,
      terminalWidth: 120,
      colorize: false,
    });
    const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    const plain = output.replace(ansiEscapePattern, "");
    expect(plain).toMatch(/#1\nevent:/);
    expect(plain).toMatch(/tool_name: list_catalogs\n#2\nevent:/);
  });

  test("omits row numbers for a single line-mode row", () => {
    const result = {
      metadata: {},
      columns: ["event", "timestamp"],
      rows: [{ event: "mcp_tool_call", timestamp: "2026-06-21T06:35:24.409Z" }],
    };
    const output = renderQueryHumanOutput(result, {
      layout: "line",
      maxColumnWidth: 80,
      terminalWidth: 120,
      colorize: false,
    });
    expect(output).toContain("event:");
    expect(output).not.toContain("#1");
  });

  test("colorizes each scalar data type in line output", () => {
    enableTerminalColorForTests();
    try {
      const result = {
        metadata: {},
        columns: ["event", "timestamp", "success", "duration", "error_message", "input"],
        rows: [
          {
            event: "mcp_tool_call",
            timestamp: "2026-06-21T06:35:24.409Z",
            success: true,
            duration: 285,
            error_message: null,
            input: '{"catalog_names":["altertable"]}',
          },
        ],
      };
      const output = renderQueryHumanOutput(result, {
        layout: "line",
        maxColumnWidth: 80,
        terminalWidth: 120,
        colorize: true,
      });
      expect(output).toContain("\u001b[34m");
      expect(output).toContain("\u001b[35m");
      expect(output).toContain("\u001b[33m");
      expect(output).toContain("\u001b[90m");
    } finally {
      restoreTerminalColorForTests();
    }
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
    expect(footer).toContain("019ee8e4-1d79-77d9-8693-1f67732b184d");
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
  let savedTest: string | undefined;
  let savedCi: string | undefined;

  beforeEach(() => {
    savedTest = process.env.TEST;
    savedCi = process.env.CI;
  });

  afterEach(() => {
    if (savedTest === undefined) {
      delete process.env.TEST;
    } else {
      process.env.TEST = savedTest;
    }
    if (savedCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = savedCi;
    }
  });

  test("returns input unchanged when disabled", () => {
    const json = '{"key":"value","count":42}';
    const output = highlightJsonForTerminal(json, false);
    expect(output).toBe(json);
    expect(output).not.toContain("\u001b");
  });

  test("adds ANSI codes when enabled", () => {
    enableTerminalColorForTests();
    try {
      const json = '{"key":"value","count":42,"enabled":true,"missing":null}';
      const output = highlightJsonForTerminal(json, true);
      expect(output).toContain("\u001b[96m");
      expect(output).toContain("\u001b[34m");
      expect(output).toContain("\u001b[35m");
      expect(output).toContain("\u001b[33m");
      expect(output).toContain("\u001b[90m");
    } finally {
      restoreTerminalColorForTests();
    }
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
    configSet("query_max_width", "24");
    configSet("query_layout", "table");
    const options = defaultDisplayOptions();
    expect(options.maxColumnWidth).toBe(24);
    expect(options.layout).toBe("table");
  });
});
