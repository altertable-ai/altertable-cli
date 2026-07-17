import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from "@/test-utils/lakehouse.ts";

let workspace: LakehouseTestWorkspace;

beforeEach(() => {
  workspace = createLakehouseTestWorkspace("append-command");
});

afterEach(() => workspace.cleanup());

describe("append command", () => {
  test("sends JSON rows and the synchronous execution option", async () => {
    workspace.writeMocks([{ urlPattern: "/append", method: "POST", body: '{"ok":true}' }]);

    await runCommandWithTestRuntime([
      "append",
      "--catalog",
      "memory",
      "--schema",
      "main",
      "--table",
      "users",
      "--data",
      '{"id":1}',
      "--sync",
    ]);

    expect(workspace.readHttpLog()).toContain("URL=https://example.com/append?");
    expect(workspace.readHttpLog()).toContain("sync=true");
    expect(JSON.parse(workspace.readPayloads()[0] ?? "")).toEqual({ id: 1 });
  });

  test("fetches append task status without run arguments", async () => {
    const appendId = "11111111-2222-3333-4444-555555555555";
    workspace.writeMocks([
      {
        urlPattern: `/tasks/${appendId}`,
        method: "GET",
        body: `{"task_id":"${appendId}","status":"completed"}`,
      },
    ]);

    await runCommandWithTestRuntime(["append", "status", appendId]);

    expect(workspace.readHttpLog()).toContain(`URL=https://example.com/tasks/${appendId}`);
  });
});
