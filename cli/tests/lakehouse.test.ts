import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { ParseError } from "@/lib/errors.ts";
import {
  csvEscapeCell,
  formatAutocompleteHumanOutput,
  getQueryColumnNames,
  lakehouseAppend,
  lakehouseAutocomplete,
  lakehouseCancel,
  lakehouseGetTask,
  lakehouseQueryAll,
  lakehouseUpload,
  lakehouseValidate,
  parseLakehouseQueryResponse,
  parseLakehouseQueryStream,
  renderQueryCsv,
  renderQueryJson,
  renderQueryTable,
  type LakehouseRow,
} from "@/lib/lakehouse-client.ts";
import { httpSendStream } from "@/lib/http.ts";

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
  setCliContext({ debug: false, json: false });
});

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

describe("lakehouseQueryAll", () => {
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

    const streamedResult = await lakehouseQueryAll("SELECT 1");
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

describe("formatAutocompleteHumanOutput", () => {
  test("prints one suggestion per line", () => {
    const output = formatAutocompleteHumanOutput({
      suggestions: [{ suggestion: "users" }, { suggestion: "orders" }],
      statement: "SELECT * FROM ",
    });
    expect(output).toBe("users\norders");
  });
});

describe("lakehouse request construction", () => {
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

    await lakehouseAppend("memory", "main", "users", '{"id":1}', { sync: true });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("URL=https://example.com/append?");
    expect(logContent).toContain("sync=true");
  });

  test("get-task calls /tasks/{task_id}", async () => {
    const taskId = "11111111-2222-3333-4444-555555555555";
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: `/tasks/${taskId}`,
          method: "GET",
          body: '{"task_id":"11111111-2222-3333-4444-555555555555","status":"completed"}',
        },
      ]),
    );

    const response = await lakehouseGetTask(taskId);
    expect(response).toContain("completed");

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(`URL=https://example.com/tasks/${taskId}`);
  });

  test("autocomplete request includes optional context fields", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/autocomplete",
          method: "POST",
          body: '{"suggestions":[]}',
        },
      ]),
    );

    await lakehouseAutocomplete({
      statement: "SELECT * FROM ",
      catalog: "memory",
      schema: "main",
      sessionId: "session-1",
      maxSuggestions: 5,
    });

    const logContent = readFileSync(logFile, "utf8");
    const payloadLine = logContent
      .split("\n")
      .find((line) => line.startsWith("PAYLOAD="))
      ?.slice("PAYLOAD=".length);
    expect(payloadLine).toBeDefined();

    const payload = JSON.parse(payloadLine ?? "{}") as Record<string, unknown>;
    expect(payload.statement).toBe("SELECT * FROM ");
    expect(payload.catalog).toBe("memory");
    expect(payload.schema).toBe("main");
    expect(payload.session_id).toBe("session-1");
    expect(payload.max_suggestions).toBe(5);
  });

  test("autocomplete request omits optional fields when not provided", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/autocomplete",
          method: "POST",
          body: '{"suggestions":[]}',
        },
      ]),
    );

    await lakehouseAutocomplete({ statement: "SELECT 1" });

    const logContent = readFileSync(logFile, "utf8");
    const payloadLine = logContent
      .split("\n")
      .find((line) => line.startsWith("PAYLOAD="))
      ?.slice("PAYLOAD=".length);
    const payload = JSON.parse(payloadLine ?? "{}") as Record<string, unknown>;
    expect(payload).toEqual({ statement: "SELECT 1" });
  });

  test("validate POSTs statement JSON body", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/validate",
          method: "POST",
          body: '{"valid":true}',
        },
      ]),
    );

    await lakehouseValidate("SELECT 1");

    const logContent = readFileSync(logFile, "utf8");
    const payloadLine = logContent
      .split("\n")
      .find((line) => line.startsWith("PAYLOAD="))
      ?.slice("PAYLOAD=".length);
    expect(JSON.parse(payloadLine ?? "{}")).toEqual({ statement: "SELECT 1" });
  });

  test("upload sends octet-stream and primary_key query param", async () => {
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

    await lakehouseUpload("memory", "main", "users", "csv", "upsert", uploadFile, "id");

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("URL=https://example.com/upload?");
    expect(logContent).toContain("primary_key=id");
    expect(logContent).toContain("PAYLOAD=@stream");
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

    await lakehouseCancel(queryId, "session-1");

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(`URL=https://example.com/query/${encodedQueryId}`);
    expect(logContent).toContain("session_id=session-1");
  });
});
