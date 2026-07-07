import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { ParseError } from "@/lib/errors.ts";
import {
  buildLakehouseQueryPayload,
  csvEscapeCell,
  getQueryColumnNames,
  parseLakehouseQueryResponse,
  parseLakehouseQueryStream,
  renderQueryCsv,
  renderQueryJson,
  renderQueryTable,
  type LakehouseQueryResult,
  type LakehouseRow,
} from "@/lib/lakehouse-client.ts";
import { httpSendStream } from "@/lib/http.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { httpStreamEffect, runOperationEffect } from "@/lib/operation-effect.ts";
import type { OperationContext } from "@/lib/operation-command.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import { runCommandWithTestRuntime } from "@tests/cli-test-runtime.ts";

const SAMPLE_NDJSON = [
  '{"statement":"SELECT 1","session_id":"abc","query_id":"def"}',
  '["id","name"]',
  '[1,"Alice"]',
  '[2,"Bob"]',
].join("\n");

let testHome = "";
let mockFile = "";
let logFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-lakehouse-test-"));
  mockFile = join(testHome, "mocks.json");
  logFile = join(testHome, "http.log");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_HTTP_LOG = logFile;
  process.env.ALTERTABLE_API_BASE = "https://example.com";
  process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "testuser";
  process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "testpass";
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliRuntime().context);
});

function createOperationContext(): OperationContext {
  const runtime = getCliRuntime();
  return {
    args: {},
    rawArgs: [],
    runtime,
    sink: runtime.output,
    execution: createExecutionContext(runtime),
  };
}

async function collectLakehouseQueryStream(
  stream: ReadableStream<Uint8Array>,
): Promise<LakehouseQueryResult> {
  const parser = parseLakehouseQueryStream(stream);
  while (true) {
    const next = await parser.next();
    if (next.done) {
      return next.value;
    }
  }
}

function readLoggedPayloads(): string[] {
  return readFileSync(logFile, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("PAYLOAD="))
    .map((line) => line.slice("PAYLOAD=".length));
}

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_HTTP_LOG;
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
});

describe("parseLakehouseQueryResponse", () => {
  test("parses metadata, columns, and rows", () => {
    const result = parseLakehouseQueryResponse(SAMPLE_NDJSON);

    expect(result.metadata.statement).toBe("SELECT 1");
    expect(result.metadata.session_id).toBe("abc");
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rows).toEqual([
      [1, "Alice"],
      [2, "Bob"],
    ]);
  });

  test("parses object column metadata and object rows", () => {
    const result = parseLakehouseQueryResponse(
      [
        '{"statement":"SELECT * FROM users"}',
        '[{"name":"id","type":"integer"},{"name":"name","type":"varchar"}]',
        '{"id":1,"name":"Alice"}',
        "",
      ].join("\n"),
    );

    expect(result.columns).toEqual([
      { name: "id", type: "integer" },
      { name: "name", type: "varchar" },
    ]);
    expect(result.rows).toEqual([{ id: 1, name: "Alice" }]);
  });

  test("treats a non-column second line as the first row", () => {
    const result = parseLakehouseQueryResponse(
      ['{"statement":"SELECT 1"}', '{"id":1}', "", '{"id":2}'].join("\n"),
    );

    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("throws ParseError when metadata is not an object", () => {
    expect(() => parseLakehouseQueryResponse("[]\n")).toThrow("metadata must be a JSON object");
  });

  test("throws ParseError with line index for malformed JSON", () => {
    const malformed = `${SAMPLE_NDJSON}\nnot-json`;
    try {
      parseLakehouseQueryResponse(malformed);
      throw new Error("expected parse failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).message).toContain("line 5");
    }
  });

  test("throws ParseError for empty response", () => {
    expect(() => parseLakehouseQueryResponse("")).toThrow(ParseError);
    expect(() => parseLakehouseQueryResponse("   \n  ")).toThrow(ParseError);
  });
});

describe("parseLakehouseQueryStream", () => {
  test("parses rows split across stream chunks", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/query",
          method: "POST",
          chunked: true,
          body: SAMPLE_NDJSON,
        },
      ]),
    );

    const byteStream = await httpSendStream({
      method: "POST",
      url: "https://example.com/query",
      authHeader: "Authorization: Basic test",
      body: '{"statement":"SELECT 1"}',
    });

    const rowValues: LakehouseRow[] = [];
    const streamParser = parseLakehouseQueryStream(byteStream);
    while (true) {
      const next = await streamParser.next();
      if (next.done) {
        expect(next.value.rows).toEqual([
          [1, "Alice"],
          [2, "Bob"],
        ]);
        break;
      }
      rowValues.push(next.value);
    }

    expect(rowValues).toEqual([
      [1, "Alice"],
      [2, "Bob"],
    ]);
  });

  test("throws ParseError when metadata line is incomplete across first chunk", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"statement":"SELECT 1"'));
        controller.close();
      },
    });

    try {
      const streamParser = parseLakehouseQueryStream(stream);
      await streamParser.next();
      throw new Error("expected parse failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
    }
  });

  test("throws ParseError for empty stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });

    try {
      const streamParser = parseLakehouseQueryStream(stream);
      await streamParser.next();
      throw new Error("expected parse failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
    }
  });

  test("streams a pending first row when no columns line is present", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(['{"statement":"SELECT 1"}', '{"id":1}', '{"id":2}'].join("\n")),
        );
        controller.close();
      },
    });

    const rowValues: LakehouseRow[] = [];
    const streamParser = parseLakehouseQueryStream(stream);
    while (true) {
      const next = await streamParser.next();
      if (next.done) {
        expect(next.value.columns).toEqual([]);
        expect(next.value.rows).toEqual([{ id: 1 }, { id: 2 }]);
        break;
      }
      rowValues.push(next.value);
    }

    expect(rowValues).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("malformed row line includes line index", async () => {
    const malformedBody = `${SAMPLE_NDJSON}\nnot-json`;
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/query",
          method: "POST",
          chunked: true,
          body: malformedBody,
        },
      ]),
    );

    const byteStream = await httpSendStream({
      method: "POST",
      url: "https://example.com/query",
      authHeader: "Authorization: Basic test",
      body: '{"statement":"SELECT 1"}',
    });

    const streamParser = parseLakehouseQueryStream(byteStream);
    await streamParser.next();
    await streamParser.next();
    try {
      await streamParser.next();
      throw new Error("expected parse failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).message).toContain("line 5");
    }
  });
});

describe("lakehouse query stream effect", () => {
  test("returns the same result as parseLakehouseQueryResponse", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/query",
          method: "POST",
          chunked: true,
          body: SAMPLE_NDJSON,
        },
      ]),
    );

    const streamedResult = await runOperationEffect(
      httpStreamEffect(
        {
          plane: "lakehouse",
          method: "POST",
          endpoint: "/query",
          body: JSON.stringify(buildLakehouseQueryPayload("SELECT 1")),
          contentType: "application/json",
          retry: false,
        },
        collectLakehouseQueryStream,
      ),
      createOperationContext(),
    );
    const bufferedResult = parseLakehouseQueryResponse(SAMPLE_NDJSON);

    expect(streamedResult).toEqual(bufferedResult);
  });
});

describe("query renderers", () => {
  const parsedResult = parseLakehouseQueryResponse(SAMPLE_NDJSON);

  test("renderQueryTable prints a padded table", () => {
    const table = renderQueryTable(parsedResult);
    expect(table).toContain("id");
    expect(table).toContain("name");
    expect(table).toContain("Alice");
    expect(table).toContain("Bob");
  });

  test("renderQueryCsv outputs header and quoted values", () => {
    const csv = renderQueryCsv(parsedResult);
    expect(csv).toBe("id,name\n1,Alice\n2,Bob");
  });

  test("csvEscapeCell quotes commas, quotes, and newlines", () => {
    expect(csvEscapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscapeCell("a,b")).toBe('"a,b"');
    expect(csvEscapeCell("line\nbreak")).toBe('"line\nbreak"');
  });

  test("renderQueryJson pretty-prints structured output", () => {
    const json = renderQueryJson(parsedResult);
    const parsed = JSON.parse(json) as {
      metadata: { statement: string };
      rows: unknown[][];
    };
    expect(parsed.metadata.statement).toBe("SELECT 1");
    expect(parsed.rows).toHaveLength(2);
  });

  test("getQueryColumnNames derives names from object rows", () => {
    const names = getQueryColumnNames({
      metadata: {},
      columns: [],
      rows: [{ id: 1, name: "Alice" }],
    });
    expect(names).toEqual(["id", "name"]);
  });
});

describe("lakehouse command HTTP behavior", () => {
  test("query command sends optional query and session identifiers", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/query",
          method: "POST",
          body: SAMPLE_NDJSON,
        },
      ]),
    );

    await runCommandWithTestRuntime([
      "query",
      "--statement",
      "SELECT 1",
      "--format",
      "json",
      "--query-id",
      "query-1",
      "--session-id",
      "session-1",
    ]);

    expect(JSON.parse(readLoggedPayloads()[0] ?? "")).toEqual({
      statement: "SELECT 1",
      query_id: "query-1",
      session_id: "session-1",
    });
  });

  test("query subcommands dispatch without requiring --statement", async () => {
    const queryId = "11111111-2222-3333-4444-555555555555";
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: `/query/${queryId}`,
          method: "GET",
          body: '{"uuid":"11111111-2222-3333-4444-555555555555"}',
        },
        {
          urlPattern: `/query/${queryId}`,
          method: "DELETE",
          body: '{"cancelled":true}',
        },
      ]),
    );

    await runCommandWithTestRuntime(["query", "show", queryId]);
    await runCommandWithTestRuntime(["query", "cancel", queryId, "--session-id", "session-1"]);

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("METHOD=GET");
    expect(logContent).toContain(`URL=https://example.com/query/${queryId}`);
    expect(logContent).toContain("METHOD=DELETE");
    expect(logContent).toContain(`URL=https://example.com/query/${queryId}?session_id=session-1`);
  });

  test("append --sync sends sync=true query param", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/append",
          method: "POST",
          body: '{"ok":true}',
        },
      ]),
    );

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

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("URL=https://example.com/append?");
    expect(logContent).toContain("sync=true");
    expect(JSON.parse(readLoggedPayloads()[0] ?? "")).toEqual({ id: 1 });
  });

  test("append status calls /tasks/{append_id}", async () => {
    const appendId = "11111111-2222-3333-4444-555555555555";
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: `/tasks/${appendId}`,
          method: "GET",
          body: '{"task_id":"11111111-2222-3333-4444-555555555555","status":"completed"}',
        },
      ]),
    );

    await runCommandWithTestRuntime(["append", "status", appendId]);

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(`URL=https://example.com/tasks/${appendId}`);
  });

  test("upload command sends mode without exposing file contents", async () => {
    const uploadFile = join(testHome, "data.csv");
    writeFileSync(uploadFile, "id,name\n1,Alice", "utf8");
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/upload",
          method: "POST",
          body: '{"ok":true}',
        },
      ]),
    );

    await runCommandWithTestRuntime([
      "upload",
      "--catalog",
      "memory",
      "--schema",
      "main",
      "--table",
      "users",
      "--format",
      "csv",
      "--mode",
      "overwrite",
      "--file",
      uploadFile,
    ]);

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("URL=https://example.com/upload?");
    expect(logContent).toContain("mode=overwrite");
    expect(logContent).not.toContain("format=csv");
    expect(logContent).not.toContain("primary_key=id");
    expect(logContent).toContain("PAYLOAD=@blob");
    expect(logContent).not.toContain("id,name");
  });

  test("upsert command sends primary key without upload mode", async () => {
    const uploadFile = join(testHome, "data.csv");
    writeFileSync(uploadFile, "id,name\n1,Alice", "utf8");
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/upsert",
          method: "POST",
          body: '{"ok":true}',
        },
      ]),
    );

    await runCommandWithTestRuntime([
      "upsert",
      "--catalog",
      "memory",
      "--schema",
      "main",
      "--table",
      "users",
      "--primary-key",
      "id",
      "--format",
      "csv",
      "--file",
      uploadFile,
    ]);

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("URL=https://example.com/upsert?");
    expect(logContent).toContain("primary_key=id");
    expect(logContent).not.toContain("mode=upsert");
    expect(logContent).toMatch(/PAYLOAD=@(?:blob|stream)/);
  });

  test("upload command rejects missing files and directories", async () => {
    const directoryPath = join(testHome, "upload-directory");
    mkdirSync(directoryPath);

    try {
      await runCommandWithTestRuntime([
        "upload",
        "--catalog",
        "memory",
        "--schema",
        "main",
        "--table",
        "users",
        "--format",
        "csv",
        "--mode",
        "overwrite",
        "--file",
        join(testHome, "missing.csv"),
      ]);
      throw new Error("expected missing file failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("File not found");
    }

    try {
      await runCommandWithTestRuntime([
        "upload",
        "--catalog",
        "memory",
        "--schema",
        "main",
        "--table",
        "users",
        "--format",
        "csv",
        "--mode",
        "overwrite",
        "--file",
        directoryPath,
      ]);
      throw new Error("expected directory failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("File not found");
    }
  });

  test("cancel URL-encodes query id in path", async () => {
    const queryId = "query/id+special";
    const encodedQueryId = encodeURIComponent(queryId);
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: `/query/${encodedQueryId}`,
          method: "DELETE",
          body: '{"cancelled":true}',
        },
      ]),
    );

    await runCommandWithTestRuntime(["query", "cancel", queryId, "--session-id", "session-1"]);

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(`URL=https://example.com/query/${encodedQueryId}`);
    expect(logContent).toContain("session_id=session-1");
  });
});
