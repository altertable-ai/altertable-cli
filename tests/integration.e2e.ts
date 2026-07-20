import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

const API_BASE = "http://0.0.0.0:15000";

describe("lakehouse integration flows", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_BASE: API_BASE,
      ALTERTABLE_LAKEHOUSE_USERNAME: "testuser",
      ALTERTABLE_LAKEHOUSE_PASSWORD: "testpass",
    });
  });

  test("upload, upsert, query formats, append, and debug behave against the mock lakehouse", async () => {
    const uploadFile = await workspace.writeFile("upload.csv", "id,name\n1,Alice\n2,Bob\n");
    let result = await workspace.runCommand(
      `altertable upload "${uploadFile}" --to memory.main.cli_test --mode overwrite`,
    );
    expect(result.exitCode).toBe(0);

    const upsertFile = await workspace.writeFile("upsert.csv", "id,name\n2,Bobby\n");
    result = await workspace.runCommand(
      `altertable upsert "${upsertFile}" --to memory.main.cli_test --key id`,
    );
    expect(result.exitCode).toBe(0);

    result = await workspace.runCommand('altertable --json query "SELECT * FROM cli_test WHERE id = 2"');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).rows[0][1]).toBe("Bobby");

    result = await workspace.runCommand('altertable query "SELECT * FROM cli_test ORDER BY id"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("id");
    expect(result.stdout).toContain("Alice");

    result = await workspace.runCommand('altertable query "SELECT * FROM cli_test ORDER BY id" --format csv');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("id,name");
    expect(result.stdout).toContain("1,Alice");

    result = await workspace.runCommand('altertable --json query "SELECT * FROM cli_test ORDER BY id"');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).columns[0]).toBe("id");
    expect(JSON.parse(result.stdout).rows[0][1]).toBe("Alice");

    result = await workspace.runCommand('altertable --agent query "SELECT * FROM cli_test ORDER BY id"');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).columns[0]).toBe("id");

    result = await workspace.runCommand('altertable --agent query "SELECT 1" --layout table');
    expect(result.exitCode).not.toBe(0);

    result = await workspace.runCommand("altertable --agent profile show", { env: { ALTERTABLE_API_KEY: "atm_test" } });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).profile.name).toBe("_from_env");

    const queryId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const sessionId = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
    result = await workspace.runCommand(
      `altertable query "SELECT 42 AS answer" --query-id ${queryId} --session-id ${sessionId}`,
    );
    expect(result.exitCode).toBe(0);

    result = await workspace.runCommand(`altertable query show ${queryId}`);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uuid: queryId, query: "SELECT 42 AS answer" });

    const cancelQueryId = "c3d4e5f6-a7b8-9012-cdef-123456789012";
    const cancelSessionId = "d4e5f6a7-b8c9-0123-defa-234567890123";
    result = await workspace.runCommand(
      `altertable query "SELECT 1" --query-id ${cancelQueryId} --session-id ${cancelSessionId}`,
    );
    expect(result.exitCode).toBe(0);

    result = await workspace.runCommand(`altertable query cancel ${cancelQueryId} --session-id ${cancelSessionId}`);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).cancelled).toBe(true);

    result = await workspace.runCommand(`altertable query cancel ${cancelQueryId} --session-id wrong-session`);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).cancelled).toBe(false);

    await workspace.setupHttpLog();
    result = await workspace.runCommand(
      'altertable append \'{"id": 3, "name": "Charlie"}\' --to memory.main.cli_test',
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect(await workspace.httpLogJsonValue("PAYLOAD")).toEqual({ id: 3, name: "Charlie" });

    result = await workspace.runCommand('altertable --json query "SELECT COUNT(*) AS n FROM cli_test"');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).rows[0][0]).toBe(3);

    await workspace.setupHttpLog();
    result = await workspace.runCommand(
      'altertable append \'[{"id": 4, "name": "Delta"}, {"id": 5, "name": "Echo"}]\' --to memory.main.cli_test',
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect(await workspace.httpLogJsonValue("PAYLOAD")).toEqual([
      { id: 4, name: "Delta" },
      { id: 5, name: "Echo" },
    ]);

    result = await workspace.runCommand('altertable --json query "SELECT COUNT(*) AS n FROM cli_test"');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).rows[0][0]).toBe(5);

    await workspace.setupHttpLog();
    result = await workspace.runCommand(
      'altertable append \'{"id": 6, "name": "Foxtrot"}\' --to memory.main.cli_test --sync',
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect((await workspace.httpLogValue("URL")) ?? "").toContain("sync=true");

    result = await workspace.runCommand('altertable query "SELECT 1" --debug --json');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("[DEBUG]");
    expect(result.stderr).toContain("Request: POST");

    result = await workspace.runCommand('altertable query "SELECT 1" --json --debug');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("[DEBUG]");
    expect(result.stderr).toContain("Request: POST");
  });
});
