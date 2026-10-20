import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

const QUERY_RESPONSE = ['{"statement":"SELECT 1"}', '["id"]', '[1]'].join("\n");
const lakehouseEnv = {
  ALTERTABLE_API_BASE: "https://lakehouse.example.test",
  ALTERTABLE_LAKEHOUSE_USERNAME: "testuser",
  ALTERTABLE_LAKEHOUSE_PASSWORD: "testpass",
} as const;

describe("altertable query --file", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace();
  });

  test("reads the SQL statement from stdin", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([
      { method: "POST", urlPattern: "/query", body: QUERY_RESPONSE },
    ]);

    const result = await workspace.runCommand("altertable --json query --file -", {
      stdin: "SELECT 99 FROM dual",
      env: lakehouseEnv,
    });

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogJsonValue("PAYLOAD")).toMatchObject({
      statement: "SELECT 99 FROM dual",
    });
  });

  test("rejects empty stdin", async () => {
    const result = await workspace.runCommand("altertable --json query --file -", {
      stdin: "  \n",
      env: lakehouseEnv,
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      message: "SQL from stdin is empty.",
    });
  });
});
