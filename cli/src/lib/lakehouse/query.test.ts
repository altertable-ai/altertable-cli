import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { ParseError, QueryError } from "@/lib/errors.ts";
import {
  csvEscapeCell,
  renderQueryCsv,
  renderQueryJson,
  renderQueryOutputText,
} from "@/lib/query-output.ts";
import {
  parseLakehouseQueryResponse,
  parseLakehouseQueryStream,
  type LakehouseRow,
} from "@/lib/lakehouse-ndjson.ts";
import { getQueryColumnNames } from "@/lib/query-format.ts";
import { httpSendStream, resolveReadTimeoutMs } from "@/lib/http.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import {
  buildLakehouseQueryRequest,
  executeLakehouseQuery,
  executeLakehouseQueryBytes,
} from "@/lib/lakehouse/query.ts";
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

describe("buildLakehouseQueryRequest", () => {
  test.each([
    [undefined, 5],
    [0, 0],
    [25, 25],
  ] as const)(
    "streaming timeout precedence: request %s resolves to %s ms",
    (readTimeoutMs, expected) => {
      setCliContext({ debug: false, json: false, agent: false, readTimeoutMs: 5 });
      const request = buildLakehouseQueryRequest(
        {
          statement: "SELECT 1",
          ...(readTimeoutMs === undefined ? {} : { httpOptions: { readTimeoutMs } }),
        },
        true,
      );
      expect(
        resolveReadTimeoutMs({ ...request, url: "https://example.com/query", authHeader: "" }, 0),
      ).toBe(expected);
    },
  );

  test("streaming queries retain an unlimited default without a timeout override", () => {
    const request = buildLakehouseQueryRequest({ statement: "SELECT 1" }, true);
    expect(
      resolveReadTimeoutMs({ ...request, url: "https://example.com/query", authHeader: "" }, 0),
    ).toBe(0);
    expect(request.retry).toBe(false);
  });

  test("includes optional QueryRequest fields in the JSON body", () => {
    const request = buildLakehouseQueryRequest(
      {
        statement: "SELECT 1",
        queryId: "query-1",
        sessionId: "session-1",
        computeSize: "M",
        format: "csv",
        dialect: "snowflake",
        catalog: "analytics",
        schema: "main",
      },
      false,
    );

    expect(typeof request.body).toBe("string");
    expect(JSON.parse(request.body as string)).toEqual({
      statement: "SELECT 1",
      query_id: "query-1",
      session_id: "session-1",
      compute_size: "M",
      format: "csv",
      dialect: "snowflake",
      catalog: "analytics",
      schema: "main",
    });
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

describe("executeLakehouseQueryBytes", () => {
  test("streams raw response bytes for API-native formats", async () => {
    const csvBody = "id,name\n1,Alice\n";
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/query",
          method: "POST",
          chunked: true,
          body: csvBody,
        },
      ]),
    );

    const runtime = getCliRuntime();
    const stream = await executeLakehouseQueryBytes(
      { statement: "SELECT 1", format: "csv", computeSize: "AUTO" },
      createExecutionContext(runtime),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    expect(body).toContain("id,name");
    expect(body).toContain("1,Alice");
  });
});

describe("query renderers", () => {
  const parsedResult = parseLakehouseQueryResponse(SAMPLE_NDJSON);

  test("human query output prints a padded table", () => {
    const table = renderQueryOutputText(parsedResult, "human");
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

describe("NDJSON engine error records", () => {
  const message = "Conversion Error: invalid integer";
  const errorLine = JSON.stringify({ error: message });

  test.each([
    errorLine,
    `{}\n${errorLine}`,
    `{}\n["v"]\n${errorLine}`,
    `{}\n["v"]\n[1]\n${errorLine}`,
  ])("buffered and chunked parsers reject the same engine frame: %s", async (body) => {
    expect(() => parseLakehouseQueryResponse(body)).toThrow(message);
    const bytes = new TextEncoder().encode(`${body.replaceAll("\n", "\r\n")}\r\n`);
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      },
      cancel() {
        canceled = true;
      },
    });
    const rows: LakehouseRow[] = [];
    async function consume() {
      for await (const row of parseLakehouseQueryStream(stream)) rows.push(row);
    }
    let failure: unknown;
    try {
      await consume();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(QueryError);
    expect((failure as QueryError).message).toContain(message);
    expect(rows).toEqual(body.includes("[1]") ? [[1]] : []);
    expect(stream.locked).toBe(false);
    expect(canceled).toBe(true);
  });

  test("preserves rows with error values and additional object fields", () => {
    const result = parseLakehouseQueryResponse(
      '{}\n["error","value"]\n["valid data",1]\n{"error":"valid data","value":2}\n',
    );
    expect(result.rows).toEqual([["valid data", 1], { error: "valid data", value: 2 }]);
  });
});

describe("streamed parse line numbers", () => {
  test.each(['{}\n["v"]\n[1]\n\nnot-json', '{}\n{"v":1}\n\n \nnot-json'])(
    "counts empty and whitespace-only lines: %s",
    async (body) => {
      let bufferedFailure: unknown;
      try {
        parseLakehouseQueryResponse(body);
      } catch (error) {
        bufferedFailure = error;
      }
      const stream = new Blob([body]).stream();
      let streamedFailure: unknown;
      try {
        for await (const _row of parseLakehouseQueryStream(stream)) {
          /* consume */
        }
      } catch (error) {
        streamedFailure = error;
      }
      expect(bufferedFailure).toBeInstanceOf(ParseError);
      expect(streamedFailure).toBeInstanceOf(ParseError);
      expect((bufferedFailure as ParseError).message).toContain("line 5");
      expect((streamedFailure as ParseError).message).toBe((bufferedFailure as ParseError).message);
    },
  );
});
