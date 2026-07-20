import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from "@/test-utils/lakehouse.ts";

let workspace: LakehouseTestWorkspace;

beforeEach(() => {
  workspace = createLakehouseTestWorkspace("upload-command");
});

afterEach(() => workspace.cleanup());

describe("upload command", () => {
  test("sends the mode without logging file contents", async () => {
    const uploadFile = workspace.writeFile("data.csv", "id,name\n1,Alice");
    workspace.writeMocks([{ urlPattern: "/upload", method: "POST", body: '{"ok":true}' }]);

    await runCommandWithTestRuntime([
      "upload",
      uploadFile,
      "--to",
      "memory.main.users",
      "--mode",
      "overwrite",
    ]);

    const log = workspace.readHttpLog();
    expect(log).toContain("URL=https://example.com/upload?");
    expect(log).toContain("mode=overwrite");
    expect(log).toContain("PAYLOAD=@blob");
    expect(log).not.toContain("id,name");
  });

  test("rejects missing files and directories", async () => {
    const directory = workspace.createDirectory("directory");
    const baseArgs = ["upload"];

    for (const file of [`${workspace.home}/missing.csv`, directory]) {
      try {
        await runCommandWithTestRuntime([...baseArgs, file, "--to", "memory.main.users"]);
        throw new Error("Expected upload to reject an invalid file");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("File not found");
      }
    }
  });
});
