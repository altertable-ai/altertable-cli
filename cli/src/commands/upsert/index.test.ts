import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from "@/test-utils/lakehouse.ts";

let workspace: LakehouseTestWorkspace;

beforeEach(() => {
  workspace = createLakehouseTestWorkspace("upsert-command");
});

afterEach(() => workspace.cleanup());

describe("upsert command", () => {
  test("sends the primary key without an upload mode", async () => {
    const uploadFile = workspace.writeFile("data.csv", "id,name\n1,Alice");
    workspace.writeMocks([{ urlPattern: "/upsert", method: "POST", body: '{"ok":true}' }]);

    await runCommandWithTestRuntime([
      "upsert",
      uploadFile,
      "--to",
      "memory.main.users",
      "--key",
      "id",
    ]);

    const log = workspace.readHttpLog();
    expect(log).toContain("URL=https://example.com/upsert?");
    expect(log).toContain("primary_key=id");
    expect(log).not.toContain("mode=upsert");
    expect(log).toMatch(/PAYLOAD=@(?:blob|stream)/);
  });
});
