import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { jsonMock } from "./mock-http.ts";

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

  test("append defaults to the run command", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp([jsonMock("POST", "/append", { ok: true, task_id: appendId })]);

    const result = await workspace.runCommand("altertable append --catalog memory --schema main --table users --data '{\"id\":1}'");

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogValue("METHOD")).toBe("POST");
    expect((await workspace.httpLogValue("URL")) ?? "").toStartWith("https://lakehouse.example.test/append?");
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, task_id: appendId });
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
