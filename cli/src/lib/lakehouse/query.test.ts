import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { ParseError } from "@/lib/errors.ts";
import {
  csvEscapeCell,
  renderQueryCsv,
  renderQueryJson,
  renderQueryTable,
} from "@/lib/lakehouse-client.ts";
import {
  parseLakehouseQueryResponse,
  parseLakehouseQueryStream,
  type LakehouseRow,
} from "@/lib/lakehouse-ndjson.ts";
import { getQueryColumnNames } from "@/lib/query-format.ts";
import { httpSendStream } from "@/lib/http.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { executeLakehouseQuery } from "@/lib/lakehouse/query.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";

const SAMPLE_NDJSON = [
  '{"statement":"SELECT 1","session_id":"abc","query_id":"def"}',
  '["id","name"]',
  '[1,"Alice"]',
  '[2,"Bob"]',
].join("\n");

let testHome = "";
let mockFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-lakehouse-test-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_API_BASE = "https://example.com";
  process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "testuser";
  process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "testpass";
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliRuntime().context);
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
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

describe("executeLakehouseQuery", () => {
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

    const runtime = getCliRuntime();
    const streamedResult = await executeLakehouseQuery(
      { statement: "SELECT 1" },
      createExecutionContext(runtime),
      true,
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
