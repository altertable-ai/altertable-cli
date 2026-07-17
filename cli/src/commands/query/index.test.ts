import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
  test("sends the statement and optional identifiers", async () => {
    workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: QUERY_RESPONSE }]);

    await runCommandWithTestRuntime([
      "query",
      "SELECT 1",
      "--query-id",
      "query-1",
      "--session-id",
      "session-1",
    ]);

    expect(JSON.parse(workspace.readPayloads()[0] ?? "")).toEqual({
      statement: "SELECT 1",
      query_id: "query-1",
      session_id: "session-1",
    });
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

  test("executes a bare lowercase show statement as SQL", async () => {
    workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: QUERY_RESPONSE }]);

    await runCommandWithTestRuntime(["query", "show"]);

    expect(JSON.parse(workspace.readPayloads()[0] ?? "")).toEqual({
      statement: "show",
    });
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
