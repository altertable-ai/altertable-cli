import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { CliError, HttpError, TimeoutError } from "@/lib/errors.ts";
import {
  computeRetryDelayMs,
  getSharedDispatcher,
  httpSend,
  httpSendStream,
  isRetryableMethod,
  parseRetryAfterMs,
  redactAuthHeader,
  redactHeaderValue,
  redactResponseBodyForDebug,
  resolveFetchTimeoutMs,
  resolveReadTimeoutMs,
} from "@/lib/http.ts";
import { delay } from "@tests/test-utils.ts";

const fakeBearerKey = "atm_fake_test_key_for_redaction";
const fakeBasicToken = "fake_basic_token_value";

let testHome = "";
let mockFile = "";
let logFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-http-test-"));
  mockFile = join(testHome, "mocks.json");
  logFile = join(testHome, "http.log");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_HTTP_LOG = logFile;
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_HTTP_LOG;
});

describe("http redaction", () => {
  test("redactHeaderValue redacts Authorization", () => {
    expect(redactHeaderValue("Authorization", `Bearer ${fakeBearerKey}`)).toBe("[REDACTED]");
    expect(redactHeaderValue("authorization", fakeBasicToken)).toBe("[REDACTED]");
    expect(redactHeaderValue("Content-Type", "application/json")).toBe("application/json");
  });

  test("redactAuthHeader redacts bearer and basic auth headers", () => {
    expect(redactAuthHeader(`Authorization: Bearer ${fakeBearerKey}`)).toBe(
      "Authorization: [REDACTED]",
    );
    expect(redactAuthHeader(`Authorization: Basic ${fakeBasicToken}`)).toBe(
      "Authorization: [REDACTED]",
    );
  });

  test("logHttpRequest redacts auth values in ALTERTABLE_HTTP_LOG", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/test-redact",
          method: "GET",
          body: "{}",
        },
      ]),
    );

    await httpSend({
      method: "GET",
      url: "https://example.com/test-redact",
      authHeader: `Authorization: Bearer ${fakeBearerKey}`,
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("AUTH=Authorization: [REDACTED]");
    expect(logContent).not.toContain(fakeBearerKey);
    expect(logContent).not.toContain(fakeBasicToken);
  });

  test("logHttpRequest redacts sensitive fields from JSON payloads", async () => {
    const secretPassword = "super-secret-post-password";
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/post-secret",
          method: "POST",
          body: "{}",
        },
      ]),
    );

    await httpSend({
      method: "POST",
      url: "https://example.com/post-secret",
      authHeader: "Authorization: Bearer test",
      body: JSON.stringify({ password: secretPassword, label: "credential" }),
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).not.toContain(secretPassword);
    expect(logContent).toContain("[REDACTED]");
  });
});

describe("httpSend errors", () => {
  test("missing mock response rejects with CliError", async () => {
    writeFileSync(mockFile, JSON.stringify([]));

    return expect(
      httpSend({
        method: "GET",
        url: "https://example.com/missing",
        authHeader: "Authorization: Bearer test",
      }),
    ).rejects.toBeInstanceOf(CliError);
  });

  test("non-2xx mock response rejects with HttpError", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/server-error",
          method: "GET",
          status: 500,
          body: JSON.stringify({ message: "internal failure" }),
        },
      ]),
    );

    try {
      await httpSend({
        method: "GET",
        url: "https://example.com/server-error",
        authHeader: "Authorization: Bearer test",
        retry: false,
      });
      expect.unreachable("httpSend should have rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(500);
      expect(httpError.parsedDetail).toBe("internal failure");
    }
  });
});

describe("http retry policy", () => {
  test("isRetryableMethod allows GET HEAD DELETE only", () => {
    expect(isRetryableMethod("GET")).toBe(true);
    expect(isRetryableMethod("HEAD")).toBe(true);
    expect(isRetryableMethod("DELETE")).toBe(true);
    expect(isRetryableMethod("POST")).toBe(false);
    expect(isRetryableMethod("PUT")).toBe(false);
  });

  test("parseRetryAfterMs parses delay seconds", () => {
    expect(parseRetryAfterMs("2")).toBe(2_000);
    expect(parseRetryAfterMs(null)).toBeUndefined();
  });

  test("computeRetryDelayMs uses exponential backoff", () => {
    expect(computeRetryDelayMs(0, null)).toBe(500);
    expect(computeRetryDelayMs(1, null)).toBe(1_000);
  });

  test("GET retries retriable status codes until success", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/retry-get",
          method: "GET",
          status: 503,
          body: "temporary",
        },
        {
          urlPattern: "/retry-get",
          method: "GET",
          status: 503,
          body: "temporary",
        },
        {
          urlPattern: "/retry-get",
          method: "GET",
          status: 200,
          body: "ok",
        },
      ]),
    );

    const response = await httpSend({
      method: "GET",
      url: "https://example.com/retry-get",
      authHeader: "Authorization: Bearer test",
    });
    expect(response).toBe("ok");
  });

  test("GET does not retry non-retriable 400 responses", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/bad-request",
          method: "GET",
          status: 400,
          body: JSON.stringify({ message: "bad input" }),
        },
        {
          urlPattern: "/bad-request",
          method: "GET",
          status: 200,
          body: "ok",
        },
      ]),
    );

    return expect(
      httpSend({
        method: "GET",
        url: "https://example.com/bad-request",
        authHeader: "Authorization: Bearer test",
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  test("POST does not retry by default", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/post-mutation",
          method: "POST",
          status: 503,
          body: "temporary",
        },
        {
          urlPattern: "/post-mutation",
          method: "POST",
          status: 200,
          body: "ok",
        },
      ]),
    );

    try {
      await httpSend({
        method: "POST",
        url: "https://example.com/post-mutation",
        authHeader: "Authorization: Bearer test",
        body: "{}",
      });
      expect.unreachable("httpSend should have rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(503);
    }
  });
});

describe("TimeoutError", () => {
  test("TimeoutError extends NetworkError", () => {
    const error = new TimeoutError();
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.name).toBe("TimeoutError");
    expect(error.message).toBe("Request timed out.");
  });
});

describe("context timeout resolution", () => {
  test("resolveFetchTimeoutMs uses context read timeout override", () => {
    setCliContext({ debug: false, json: false, agent: false, readTimeoutMs: 30_000 });
    expect(
      resolveFetchTimeoutMs({
        method: "GET",
        url: "https://example.com",
        authHeader: "Authorization: Bearer test",
      }),
    ).toBe(5_000 + 30_000);
  });

  test("stream read timeout 0 uses connect-only abort when context unset", () => {
    setCliContext({ debug: false, json: false, agent: false });
    expect(
      resolveReadTimeoutMs(
        {
          method: "POST",
          url: "https://example.com/query",
          authHeader: "Authorization: Bearer test",
        },
        0,
      ),
    ).toBe(0);
    expect(
      resolveFetchTimeoutMs({
        method: "POST",
        url: "https://example.com/query",
        authHeader: "Authorization: Bearer test",
        readTimeoutMs: 0,
      }),
    ).toBe(5_000);
  });
});

describe("shared dispatcher", () => {
  test("getSharedDispatcher returns the same instance", () => {
    const first = getSharedDispatcher();
    const second = getSharedDispatcher();
    expect(first).toBe(second);
  });
});

describe("httpSendStream mocks", () => {
  test("chunked mock stream splits body by newline", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/query",
          method: "POST",
          chunked: true,
          body: '{"statement":"SELECT 1"}\n["id"]\n[1]',
        },
      ]),
    );

    const stream = await httpSendStream({
      method: "POST",
      url: "https://example.com/query",
      authHeader: "Authorization: Bearer test",
      body: "{}",
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let combined = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      combined += decoder.decode(value);
    }

    expect(combined).toBe('{"statement":"SELECT 1"}\n["id"]\n[1]');
  });
});

describe("httpSendStream live timeouts", () => {
  test("readTimeoutMs 0 does not abort body after connect timeout once response is returned", async () => {
    delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
    const originalFetch = globalThis.fetch;
    const encoder = new TextEncoder();

    globalThis.fetch = Object.assign(
      async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const signal = init?.signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            async start(controller) {
              await delay(20);
              if (signal?.aborted) {
                controller.error(new Error("stream was aborted"));
                return;
              }
              controller.enqueue(encoder.encode("ok"));
              controller.close();
            },
          }),
          { status: 200 },
        );
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const stream = await httpSendStream({
        method: "POST",
        url: "https://example.com/query",
        authHeader: "Authorization: Bearer test",
        body: "{}",
        connectTimeoutMs: 5,
        readTimeoutMs: 0,
      });

      const reader = stream.getReader();
      const { done, value } = await reader.read();

      expect(done).toBe(false);
      expect(new TextDecoder().decode(value)).toBe("ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("positive readTimeoutMs aborts when stream body takes too long", async () => {
    delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
    const originalFetch = globalThis.fetch;
    let abortObserved = false;

    globalThis.fetch = Object.assign(
      async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const signal = init?.signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              signal?.addEventListener("abort", () => {
                abortObserved = true;
                controller.error(new DOMException("stream timed out", "AbortError"));
              });
            },
          }),
          { status: 200 },
        );
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const stream = await httpSendStream({
        method: "POST",
        url: "https://example.com/query",
        authHeader: "Authorization: Bearer test",
        body: "{}",
        connectTimeoutMs: 50,
        readTimeoutMs: 5,
      });

      const reader = stream.getReader();
      try {
        await reader.read();
        expect.unreachable("stream read should have timed out");
      } catch (error) {
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).message).toBe("stream timed out");
      }
      expect(abortObserved).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("debug response redaction", () => {
  test("redactResponseBodyForDebug removes password fields from JSON", () => {
    const body = JSON.stringify({ credential: { id: "c1" }, password: "leaked-secret" });
    const redacted = redactResponseBodyForDebug(body);
    expect(redacted).not.toContain("leaked-secret");
    expect(redacted).toContain("[REDACTED]");
  });
});

describe("retry-after header", () => {
  test("honors Retry-After on retriable responses", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/retry-after",
          method: "GET",
          status: 503,
          body: "temporary",
          retryAfter: "0",
        },
        {
          urlPattern: "/retry-after",
          method: "GET",
          status: 200,
          body: "ok",
        },
      ]),
    );

    const startMs = Date.now();
    const response = await httpSend({
      method: "GET",
      url: "https://example.com/retry-after",
      authHeader: "Authorization: Bearer test",
    });
    const elapsedMs = Date.now() - startMs;

    expect(response).toBe("ok");
    expect(elapsedMs).toBeLessThan(500);
  });
});
