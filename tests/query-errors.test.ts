import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type ServerResponse } from "node:http";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

const engineMessage = "Conversion Error: Could not convert string 'not a number' to INT32";
const statement = "SELECT CAST('not a number' AS INTEGER) AS v";
const modes = ["", "--layout table", "--json", "--agent", "--format markdown"];
const allModes = [...modes, "--format jsonl", "--format csv", "--format parquet"];

// Model the server boundary: NDJSON carries error records, while native format
// generators can fail after sending bytes and terminate the HTTP response.
describe("query failures through the public CLI", () => {
  let workspace: TestWorkspace;
  let failure: "before-columns" | "after-columns" | "after-rows" | "socket" | "body-socket";
  const server = createServer(async (request, response) => {
    if (failure === "socket") {
      request.socket.destroy();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const { format } = JSON.parse(body) as { format?: string };
    if (failure === "body-socket" || format !== undefined) {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.write(format === "csv" ? "v\n1\n" : format === "parquet" ? "PAR1" : "[1]\n");
      closeBody(response);
      return;
    }
    const records: unknown[] = [{ statement, query_id: "query-error", init_time_ms: 11 }];
    if (failure !== "before-columns") records.push([{ name: "v", type: "INTEGER" }]);
    if (failure === "after-rows") records.push([1]);
    records.push({ error: engineMessage });
    response.writeHead(200, { "content-type": "application/x-ndjson" });
    response.end(records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server port");
    workspace = await createTestWorkspace({
      ALTERTABLE_API_BASE: `http://127.0.0.1:${address.port}`,
      ALTERTABLE_LAKEHOUSE_USERNAME: "testuser",
      ALTERTABLE_LAKEHOUSE_PASSWORD: "testpass",
      ALTERTABLE_MOCK_HTTP_FILE: undefined,
    });
  });

  afterAll(() => server.close());

  for (const phase of ["before-columns", "after-columns", "after-rows"] as const) {
    test.each(modes)(`${phase} engine error: %s`, async (mode) => {
      failure = phase;
      const result = await workspace.runCommand(`altertable query "${statement}" ${mode}`);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(engineMessage);
      expect(result.stderr).not.toContain("Unexpected error");
      if (mode === "--json" || mode === "--agent") {
        expect(JSON.parse(result.stderr)).toMatchObject({ code: "query_error", exit_code: 1 });
      }
    });
  }

  for (const phase of ["socket", "body-socket"] as const) {
    test.each(allModes)(`${phase} without an engine frame: %s`, async (mode) => {
      failure = phase;
      const result = await workspace.runCommand(`altertable query "${statement}" ${mode}`);
      expect(result.exitCode).toBe(9);
      expect(result.stderr).toContain("network error");
      expect(result.stderr).not.toContain("Unexpected error");
      expect(result.stderr).not.toContain(engineMessage);
      if (!mode.includes("--format jsonl") && !mode.includes("--format csv") && !mode.includes("--format parquet")) {
        expect(result.stdout).toBe("");
      } else if (phase === "body-socket") {
        expect(result.stdout.length).toBeGreaterThan(0);
      }
    });
  }
});

function closeBody(response: ServerResponse): void {
  setTimeout(() => response.destroy(), 20);
}
