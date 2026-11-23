import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

const QUERY_RESPONSE = ['{"statement":"SELECT 1"}', '["id"]', '[1]'].join("\n");
const lakehouseEnv = {
  ALTERTABLE_API_BASE: "https://lakehouse.example.test",
  ALTERTABLE_LAKEHOUSE_USERNAME: "testuser",
  ALTERTABLE_LAKEHOUSE_PASSWORD: "testpass",
} as const;

describe("altertable query @-", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace();
  });

  test("reads the SQL statement from stdin", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([
      { method: "POST", urlPattern: "/query", body: QUERY_RESPONSE },
    ]);

    const result = await workspace.runCommand("altertable --json query @-", {
      stdin: "SELECT 99 FROM dual",
      env: lakehouseEnv,
    });

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogJsonValue("PAYLOAD")).toMatchObject({
      statement: "SELECT 99 FROM dual",
    });
  });

  test("writes to the exact output filename and leaves stdout empty", async () => {
    const path = await workspace.writeFile("result.json ", "not written yet");
    await workspace.setupMockHttp([{ method: "POST", urlPattern: "/query", body: QUERY_RESPONSE }]);
    const result = await workspace.runCommand(`altertable --json query 'SELECT 1' --output "${path}"`, { env: lakehouseEnv });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(await workspace.readFile(path)).rows).toEqual([[1]]);
    expect(await workspace.fileExists(path.trimEnd())).toBe(false);
  });

  test.each([
    ["'   '", "SQL statement is empty."],
    ["'SELECT 1' --output ''", "--output requires a file path."],
  ])("rejects invalid query arguments before sending SQL: %s", async (args, message) => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([]);
    const result = await workspace.runCommand(`altertable --json query ${args}`, { env: lakehouseEnv });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).message).toBe(message);
    expect(await workspace.readHttpLog()).toBe("");
  });

  test("rejects empty stdin", async () => {
    const result = await workspace.runCommand("altertable --json query @-", {
      stdin: "  \n",
      env: lakehouseEnv,
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      message: "SQL from stdin is empty.",
    });
  });
});
