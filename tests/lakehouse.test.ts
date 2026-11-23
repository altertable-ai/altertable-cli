import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { jsonMock, textMock } from "./mock-http.ts";

const appendId = "11111111-2222-3333-4444-555555555555";

describe("lakehouse command routing", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_BASE: "https://lakehouse.example.test",
      ALTERTABLE_LAKEHOUSE_USERNAME: "testuser",
      ALTERTABLE_LAKEHOUSE_PASSWORD: "testpass",
    });
  });

  test("append accepts data directly", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([jsonMock("POST", "/append", { ok: true, task_id: appendId })]);

    const result = await workspace.runCommand("altertable append '{\"id\":1}' --to memory.main.users");

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogValue("METHOD")).toBe("POST");
    expect((await workspace.httpLogValue("URL")) ?? "").toStartWith("https://lakehouse.example.test/append?");
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, task_id: appendId });
  });

  test("query preserves headers and rows across blank NDJSON lines", async () => {
    await workspace.setupMockHttp([textMock("POST", "/query", '\n{}\r\n  \r\n["city"]\n\n["Paris"]\n')]);
    const json = await workspace.runCommand('altertable --json query "SELECT city FROM cities"');
    const markdown = await workspace.runCommand('altertable query "SELECT city FROM cities" --format markdown');

    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({ metadata: {}, columns: ["city"], rows: [["Paris"]] });
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("city");
    expect(markdown.stdout).toContain("Paris");
  });

  test.each(["--layout table", "--layout line", "--format markdown"])("query keeps distinct values under duplicate SQL column labels: %s", async flags => {
    await workspace.setupMockHttp([textMock("POST", "/query", '{}\n["id","id"]\n[17,42]')]);
    const result = await workspace.runCommand(`altertable query "SELECT 17 AS id, 42 AS id" ${flags}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/17[\s\S]*42/);
  });

  test("query list fetches running queries", async () => {
    const queries = {
      queries: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          started_at: "2026-11-05T17:49:18Z",
        },
      ],
    };
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([jsonMock("GET", "/queries", queries)]);

    const result = await workspace.runCommand("altertable --json query list");

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogValue("METHOD")).toBe("GET");
    expect(await workspace.httpLogValue("URL")).toBe("https://lakehouse.example.test/queries");
    expect(JSON.parse(result.stdout)).toEqual(queries);
  });

  test("query top fetches details for each running query", async () => {
    const queryId = "11111111-2222-3333-4444-555555555555";
    const details = { uuid: queryId, query: "SELECT 1", percentage: 12.5 };
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([
      jsonMock("GET", "/queries", { queries: [{ id: queryId, started_at: "2026-11-05T17:49:18Z" }] }),
      jsonMock("GET", `/query/${queryId}`, details),
    ]);

    const result = await workspace.runCommand("altertable --json query top");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      queries: [{ id: queryId, started_at: "2026-11-05T17:49:18Z", details }],
    });
  });

  test("append status fetches status without append-run flags", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([jsonMock("GET", `/tasks/${appendId}`, { task_id: appendId, status: "completed" })]);

    const result = await workspace.runCommand(`altertable append status ${appendId}`);

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogValue("METHOD")).toBe("GET");
    expect(await workspace.httpLogValue("URL")).toBe(`https://lakehouse.example.test/tasks/${appendId}`);
    expect(JSON.parse(result.stdout)).toEqual({ task_id: appendId, status: "completed" });
  });
});
