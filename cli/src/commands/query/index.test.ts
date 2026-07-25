import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from "@/test-utils/lakehouse.ts";

const QUERY_RESPONSE = ['{"statement":"SELECT 1"}', '["id"]', "[1]"].join("\n");
let workspace: LakehouseTestWorkspace;

beforeEach(() => {
  workspace = createLakehouseTestWorkspace("query-command");
});

afterEach(() => workspace.cleanup());

describe("query command", () => {
  test("sends statement identifiers and default compute size", async () => {
    workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: QUERY_RESPONSE }]);

    await runCommandWithTestRuntime([
      "query",
      "SELECT 1",
      "--query-id",
      "query-1",
      "--dialect",
      "snowflake",
      "--catalog",
      "analytics",
      "--schema",
      "main",
    ]);

    expect(JSON.parse(workspace.readPayloads()[0] ?? "")).toEqual({
      statement: "SELECT 1",
      query_id: "query-1",
      compute_size: "AUTO",
      dialect: "snowflake",
      catalog: "analytics",
      schema: "main",
    });
  });

  test("omits compute size with session unless an explicit size is set", async () => {
    workspace.writeMocks([
      { urlPattern: "/query", method: "POST", body: QUERY_RESPONSE },
      { urlPattern: "/query", method: "POST", body: QUERY_RESPONSE },
    ]);

    await runCommandWithTestRuntime(["query", "SELECT 1", "--session-id", "session-1"]);
    expect(JSON.parse(workspace.readPayloads()[0] ?? "")).toEqual({
      statement: "SELECT 1",
      session_id: "session-1",
    });

    await runCommandWithTestRuntime([
      "query",
      "SELECT 1",
      "--session-id",
      "session-1",
      "--compute-size",
      "S",
    ]);
    expect(JSON.parse(workspace.readPayloads()[1] ?? "")).toEqual({
      statement: "SELECT 1",
      session_id: "session-1",
      compute_size: "S",
    });
  });

  test("rejects explicit AUTO compute size with a session", async () => {
    expect(
      runCommandWithTestRuntime([
        "query",
        "SELECT 1",
        "--session-id",
        "session-1",
        "--compute-size",
        "AUTO",
      ]),
    ).rejects.toThrow("--compute-size AUTO cannot be combined with --session-id.");
  });

  test("streams API-native csv bytes instead of client-rendered CSV", async () => {
    const apiCsv = "id,name\n9,from-api\n";
    workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: apiCsv }]);

    const harness = await runCommandWithTestRuntime(["query", "SELECT 1", "--format", "csv"], {
      debug: false,
      json: false,
      agent: false,
    });

    expect(JSON.parse(workspace.readPayloads()[0] ?? "")).toEqual({
      statement: "SELECT 1",
      compute_size: "AUTO",
      format: "csv",
    });
    expect(harness.stdout.join("")).toContain("9,from-api");
  });

  test("writes API-native output to --output", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "altertable-query-output-"));
    const outputPath = join(outputDir, "result.csv");
    try {
      workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: "id\n42\n" }]);

      await runCommandWithTestRuntime(
        ["query", "SELECT 1", "--format", "csv", "--output", outputPath],
        { debug: false, json: false, agent: false },
      );

      expect(readFileSync(outputPath, "utf8")).toContain("42");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  test("keeps markdown as client-rendered NDJSON output", async () => {
    workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: QUERY_RESPONSE }]);

    const harness = await runCommandWithTestRuntime(["query", "SELECT 1", "--format", "markdown"], {
      debug: false,
      json: false,
      agent: false,
    });

    expect(JSON.parse(workspace.readPayloads()[0] ?? "")).toEqual({
      statement: "SELECT 1",
      compute_size: "AUTO",
    });
    expect(harness.stdout.join("")).toContain("|");
  });

  test("rejects API-native format with --json", async () => {
    expect(
      runCommandWithTestRuntime(["query", "SELECT 1", "--format", "parquet"], {
        debug: false,
        json: true,
        agent: false,
      }),
    ).rejects.toThrow("cannot be combined with --json or --agent");
  });

  test("dispatches show and cancel without run arguments", async () => {
    const queryId = "11111111-2222-3333-4444-555555555555";
    workspace.writeMocks([
      { urlPattern: `/query/${queryId}`, method: "GET", body: `{"uuid":"${queryId}"}` },
      { urlPattern: `/query/${queryId}`, method: "DELETE", body: '{"cancelled":true}' },
    ]);

    await runCommandWithTestRuntime(["query", "show", queryId]);
    await runCommandWithTestRuntime(["query", "cancel", queryId, "--session-id", "session-1"]);

    const log = workspace.readHttpLog();
    expect(log).toContain(`METHOD=GET\nURL=https://example.com/query/${queryId}`);
    expect(log).toContain(
      `METHOD=DELETE\nURL=https://example.com/query/${queryId}?session_id=session-1`,
    );
  });

  test("requires a query id for show instead of running bare show as SQL", async () => {
    expect(runCommandWithTestRuntime(["query", "show"])).rejects.toThrow(
      "Missing required argument: query-id.",
    );
  });

  test("URL-encodes query identifiers", async () => {
    const queryId = "query/id+special";
    const encodedQueryId = encodeURIComponent(queryId);
    workspace.writeMocks([
      { urlPattern: `/query/${encodedQueryId}`, method: "DELETE", body: '{"cancelled":true}' },
    ]);

    await runCommandWithTestRuntime(["query", "cancel", queryId, "--session-id", "session-1"]);

    expect(workspace.readHttpLog()).toContain(
      `URL=https://example.com/query/${encodedQueryId}?session_id=session-1`,
    );
  });
});
