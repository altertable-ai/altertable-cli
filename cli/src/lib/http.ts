import { appendFileSync } from "node:fs";
import { getCliContext, getConnectTimeoutMs } from "@/context.ts";
import { USER_AGENT } from "@/version.ts";
import { CliError, HttpError, NetworkError, TimeoutError, type AuthPlane } from "@/lib/errors.ts";
import { logDebug } from "@/lib/log.ts";
import { getOutputSink } from "@/lib/runtime.ts";
import {
  redactResponseBodyForDebug,
  redactSensitiveJsonString,
  redactSensitiveJsonValue,
  truncateBodySnippet,
} from "@/lib/redact.ts";
import {
  delayBeforeHttpRetry,
  MAX_RETRY_ATTEMPTS,
  shouldRetryHttpRequest,
} from "@/lib/http-retry.ts";
import { DEFAULT_READ_TIMEOUT_MS, STREAM_READ_TIMEOUT_MS } from "@/lib/transport-defaults.ts";
import { readEnv } from "@/lib/env.ts";

export type HttpSendOptions = {
  method: string;
  url: string;
  authHeader: string;
  body?: string | Blob | ArrayBuffer | ReadableStream;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  retry?: boolean;
  maxAttempts?: number;
  authPlane?: AuthPlane;
};

export type HttpStreamOptions = HttpSendOptions & {
  readTimeoutMs?: number;
};

type MockHttpEntry = {
  urlPattern: string;
  method?: string;
  authPattern?: string;
  status?: number;
  body: string;
  chunked?: boolean;
  retryAfter?: string;
};

/** Best-effort shared keep-alive dispatcher; mock requests bypass fetch entirely. */
let sharedDispatcher: unknown;
let sharedDispatcherInitialized = false;

export function getSharedDispatcher(): unknown {
  if (sharedDispatcherInitialized) {
    return sharedDispatcher;
  }

  sharedDispatcherInitialized = true;
  try {
    const undici = require("undici") as {
      Agent: new (options: { keepAliveTimeout: number; keepAliveMaxTimeout: number }) => unknown;
    };
    sharedDispatcher = new undici.Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    });
  } catch {
    sharedDispatcher = undefined;
  }

  return sharedDispatcher;
}

function resolveConnectTimeoutMs(options: HttpSendOptions): number {
  return options.connectTimeoutMs ?? getConnectTimeoutMs();
}

export function resolveReadTimeoutMs(
  options: HttpSendOptions,
  streamDefault = DEFAULT_READ_TIMEOUT_MS,
): number {
  if (options.readTimeoutMs !== undefined) {
    return options.readTimeoutMs;
  }
  const contextReadTimeoutMs = getCliContext().readTimeoutMs;
  if (contextReadTimeoutMs !== undefined) {
    return contextReadTimeoutMs;
  }
  return streamDefault;
}

export function resolveFetchTimeoutMs(options: HttpSendOptions): number {
  const connectTimeoutMs = resolveConnectTimeoutMs(options);
  const readTimeoutMs = resolveReadTimeoutMs(options);
  if (readTimeoutMs > 0) {
    return connectTimeoutMs + readTimeoutMs;
  }
  return connectTimeoutMs;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Flatten an Error's `cause` chain into a readable detail (e.g. fetch failed -> TLS reason). */
function unwrapErrorDetail(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 4; depth += 1) {
    if (current.message && !messages.includes(current.message)) {
      messages.push(current.message);
    }
    current = (current as { cause?: unknown }).cause;
  }
  return messages.join(": ");
}

function timeoutError(options: HttpSendOptions, cause: unknown): TimeoutError {
  return new TimeoutError(`Request timed out: ${options.method} ${options.url}`, { cause });
}

function connectionError(options: HttpSendOptions, cause: unknown): NetworkError {
  const detail = unwrapErrorDetail(cause);
  const suffix = detail ? ` (${detail})` : "";
  return new NetworkError(
    `Request failed (network error): ${options.method} ${options.url}${suffix}`,
    { cause },
  );
}

function streamWithTimeoutCleanup(
  stream: ReadableStream<Uint8Array>,
  clearTimeoutAfterRead: () => void,
  signal: AbortSignal,
  options: HttpStreamOptions,
): ReadableStream<Uint8Array> {
  let reader: ReturnType<typeof stream.getReader> | undefined;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const activeReader = stream.getReader();
      reader = activeReader;
      try {
        while (true) {
          const { done, value } = await activeReader.read();
          if (done) {
            clearTimeoutAfterRead();
            controller.close();
            break;
          }
          controller.enqueue(value);
        }
      } catch (error) {
        clearTimeoutAfterRead();
        controller.error(
          signal.aborted || isAbortError(error)
            ? timeoutError(options, error)
            : connectionError(options, error),
        );
      }
    },
    cancel(reason) {
      clearTimeoutAfterRead();
      return reader?.cancel(reason);
    },
  });
}

function findMatchingMock(
  mocks: MockHttpEntry[],
  options: HttpSendOptions,
  attemptIndex: number,
): MockHttpEntry | undefined {
  const matchingMocks = mocks.filter((mock) => {
    const urlMatches = options.url.includes(mock.urlPattern);
    const methodMatches = !mock.method || mock.method === options.method;
    const authMatches = !mock.authPattern || options.authHeader.includes(mock.authPattern);
    return urlMatches && methodMatches && authMatches;
  });

  if (matchingMocks.length === 0) {
    return undefined;
  }

  return matchingMocks[Math.min(attemptIndex, matchingMocks.length - 1)];
}

function createChunkedMockStream(body: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = body.split("\n");

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        if (line === undefined) {
          continue;
        }
        const suffix = lineIndex < lines.length - 1 ? "\n" : body.endsWith("\n") ? "\n" : "";
        controller.enqueue(encoder.encode(`${line}${suffix}`));
      }
      controller.close();
    },
  });
}

async function executeMockRequest(options: HttpSendOptions, attemptIndex: number): Promise<string> {
  const mockFile = readEnv("ALTERTABLE_MOCK_HTTP_FILE");
  if (!mockFile) {
    throw new CliError("Mock HTTP file is not configured.");
  }

  const mocks = JSON.parse(await Bun.file(mockFile).text()) as MockHttpEntry[];
  logHttpRequest(options);

  const match = findMatchingMock(mocks, options, attemptIndex);
  if (!match) {
    throw new CliError(`No mock HTTP response for ${options.method} ${options.url}`);
  }

  const status = match.status ?? 200;
  if (status >= 200 && status < 300) {
    return match.body;
  }

  throwHttpError(
    status,
    match.body,
    options.method,
    options.url,
    options.authPlane,
    match.retryAfter ?? null,
  );
}

async function executeMockStream(
  options: HttpStreamOptions,
  attemptIndex: number,
): Promise<ReadableStream<Uint8Array>> {
  const mockFile = readEnv("ALTERTABLE_MOCK_HTTP_FILE");
  if (!mockFile) {
    throw new CliError("Mock HTTP file is not configured.");
  }

  const mocks = JSON.parse(await Bun.file(mockFile).text()) as MockHttpEntry[];
  logHttpRequest(options);

  const match = findMatchingMock(mocks, options, attemptIndex);
  if (!match) {
    throw new CliError(`No mock HTTP response for ${options.method} ${options.url}`);
  }

  const status = match.status ?? 200;
  if (status < 200 || status >= 300) {
    throwHttpError(
      status,
      match.body,
      options.method,
      options.url,
      options.authPlane,
      match.retryAfter ?? null,
    );
  }

  if (match.chunked) {
    return createChunkedMockStream(match.body);
  }

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(match.body));
      controller.close();
    },
  });
}

export function redactHeaderValue(headerName: string, headerValue: string): string {
  if (headerName.toLowerCase() === "authorization") {
    return "[REDACTED]";
  }
  return headerValue;
}

export function redactAuthHeader(authHeader: string): string {
  const colonIndex = authHeader.indexOf(": ");
  if (colonIndex === -1) {
    return authHeader;
  }
  const headerName = authHeader.slice(0, colonIndex);
  const headerValue = authHeader.slice(colonIndex + 2);
  return `${headerName}: ${redactHeaderValue(headerName, headerValue)}`;
}

function logHttpRequest(options: HttpSendOptions): void {
  const logPath = readEnv("ALTERTABLE_HTTP_LOG");
  if (!logPath) {
    return;
  }

  let payload = "";
  if (typeof options.body === "string") {
    payload = redactSensitiveJsonString(options.body);
  } else if (options.body instanceof Blob) {
    payload = "@blob";
  } else if (options.body !== undefined) {
    payload = "@stream";
  }

  appendFileSync(
    logPath,
    `METHOD=${options.method}\nURL=${options.url}\nAUTH=${redactAuthHeader(options.authHeader)}\nPAYLOAD=${payload}\n---\n`,
  );
}

function httpExtractBodyDetail(body: string): string | undefined {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string } | string;
        message?: string;
      };
      const detail =
        (typeof parsed.error === "object" && parsed.error?.message) ||
        (typeof parsed.message === "string" ? parsed.message : "") ||
        (typeof parsed.error === "string" ? parsed.error : "");
      if (detail) {
        return detail;
      }
      return `Response: ${JSON.stringify(redactSensitiveJsonValue(parsed))}`;
    } catch {
      return getCliContext().debug
        ? `Response: ${redactResponseBodyForDebug(body)}`
        : `Response: ${truncateBodySnippet(body)}`;
    }
  }
  if (trimmed && getCliContext().debug) {
    return `Response body: ${redactResponseBodyForDebug(body)}`;
  }
  return undefined;
}

function throwHttpError(
  status: number,
  body: string,
  method: string,
  url: string,
  authPlane?: AuthPlane,
  retryAfterHeader?: string | null,
): never {
  throw new HttpError({
    status,
    body,
    method,
    url,
    parsedDetail: httpExtractBodyDetail(body),
    authPlane,
    retryAfterHeader,
  });
}

export function buildRequestHeaders(options: HttpSendOptions): Record<string, string> {
  const headers: Record<string, string> = {};

  const colonIndex = options.authHeader.indexOf(": ");
  if (colonIndex !== -1) {
    const authName = options.authHeader.slice(0, colonIndex);
    const authValue = options.authHeader.slice(colonIndex + 2);
    headers[authName] = authValue;
  }

  headers["User-Agent"] = USER_AGENT;
  Object.assign(headers, options.extraHeaders);

  if (options.contentType) {
    headers["Content-Type"] = options.contentType;
  } else if (typeof options.body === "string" && options.body.length > 0) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function logHttpDebug(lines: string[]): void {
  if (!getCliContext().debug) {
    return;
  }
  const sink = getOutputSink();
  for (const line of lines) {
    sink.writeStderr(line);
  }
}

async function executeLiveRequest(options: HttpSendOptions): Promise<string> {
  const headers = buildRequestHeaders(options);
  const timeoutMs = resolveFetchTimeoutMs(options);
  const signal = AbortSignal.timeout(timeoutMs);

  logHttpRequest(options);
  logDebug(`Request: ${options.method} ${options.url}`);

  logHttpDebug([
    `> ${options.method} ${options.url}`,
    ...Object.entries(headers).map(([key, value]) => `> ${key}: ${redactHeaderValue(key, value)}`),
  ]);

  let response: Response;
  try {
    response = await fetch(options.url, {
      method: options.method,
      headers,
      body: options.body,
      signal,
      dispatcher: getSharedDispatcher(),
    } as RequestInit);
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw timeoutError(options, error);
    }
    throw connectionError(options, error);
  }

  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw timeoutError(options, error);
    }
    throw connectionError(options, error);
  }

  logHttpDebug([
    `< HTTP/${response.status}`,
    ...(responseBody ? [redactResponseBodyForDebug(responseBody)] : []),
  ]);

  if (response.status >= 200 && response.status < 300) {
    return responseBody;
  }

  throwHttpError(
    response.status,
    responseBody,
    options.method,
    options.url,
    options.authPlane,
    response.headers.get("Retry-After"),
  );
}

async function executeLiveStream(options: HttpStreamOptions): Promise<ReadableStream<Uint8Array>> {
  const headers = buildRequestHeaders(options);
  const connectTimeoutMs = resolveConnectTimeoutMs(options);
  const readTimeoutMs = resolveReadTimeoutMs(options, STREAM_READ_TIMEOUT_MS);
  const abortController = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    abortController.abort();
  }, connectTimeoutMs);
  const clearActiveTimeout = () => {
    if (timeout === undefined) {
      return;
    }
    clearTimeout(timeout);
    timeout = undefined;
  };

  logHttpRequest(options);
  logDebug(`Request: ${options.method} ${options.url}`);

  let response: Response;
  try {
    response = await fetch(options.url, {
      method: options.method,
      headers,
      body: options.body,
      signal: abortController.signal,
      dispatcher: getSharedDispatcher(),
    } as RequestInit);
    clearActiveTimeout();
  } catch (error) {
    clearActiveTimeout();
    if (abortController.signal.aborted || isAbortError(error)) {
      throw timeoutError(options, error);
    }
    throw connectionError(options, error);
  }

  if (response.status >= 200 && response.status < 300) {
    if (!response.body) {
      throw new NetworkError("Response body is missing.");
    }
    if (readTimeoutMs <= 0) {
      return response.body;
    }
    timeout = setTimeout(() => {
      abortController.abort();
    }, readTimeoutMs);
    return streamWithTimeoutCleanup(
      response.body,
      clearActiveTimeout,
      abortController.signal,
      options,
    );
  }

  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch (error) {
    if (abortController.signal.aborted || isAbortError(error)) {
      throw timeoutError(options, error);
    }
    throw connectionError(options, error);
  }
  throwHttpError(
    response.status,
    responseBody,
    options.method,
    options.url,
    options.authPlane,
    response.headers.get("Retry-After"),
  );
}

export async function httpSend(options: HttpSendOptions): Promise<string> {
  const maxAttempts = options.maxAttempts ?? MAX_RETRY_ATTEMPTS;
  const mockFile = readEnv("ALTERTABLE_MOCK_HTTP_FILE");

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    try {
      if (mockFile) {
        return await executeMockRequest(options, attemptIndex);
      }
      return await executeLiveRequest(options);
    } catch (error) {
      if (error instanceof HttpError) {
        if (shouldRetryHttpRequest(options, error.status, attemptIndex, maxAttempts)) {
          await delayBeforeHttpRetry(attemptIndex, error.retryAfterHeader ?? null);
          continue;
        }
      }

      throw error;
    }
  }

  throw new NetworkError("Request failed after retries.");
}

export async function httpSendStream(
  options: HttpStreamOptions,
): Promise<ReadableStream<Uint8Array>> {
  const maxAttempts = options.maxAttempts ?? MAX_RETRY_ATTEMPTS;
  const mockFile = readEnv("ALTERTABLE_MOCK_HTTP_FILE");

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    try {
      if (mockFile) {
        return await executeMockStream(options, attemptIndex);
      }
      return await executeLiveStream(options);
    } catch (error) {
      if (error instanceof HttpError) {
        if (shouldRetryHttpRequest(options, error.status, attemptIndex, maxAttempts)) {
          await delayBeforeHttpRetry(attemptIndex, error.retryAfterHeader ?? null);
          continue;
        }
      }

      throw error;
    }
  }

  throw new NetworkError("Request failed after retries.");
}
