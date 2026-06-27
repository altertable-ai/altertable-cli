import { resolveApiBase } from "@/lib/config.ts";
import { getLakehouseAuthHeader } from "@/lib/auth.ts";
import { httpSend, httpSendStream, type HttpSendOptions } from "@/lib/http.ts";
import { getCliRuntime } from "@/lib/runtime.ts";
import { STREAM_READ_TIMEOUT_MS } from "@/lib/transport-defaults.ts";
import { urlencode } from "@/lib/encode.ts";
import { createUploadProgressReporter, shouldShowProgress } from "@/lib/progress.ts";
import {
  parseLakehouseQueryHeader,
  type LakehouseColumn,
  type LakehouseQueryMetadata,
  type LakehouseQueryResult,
  type LakehouseRow,
} from "@/lib/lakehouse-ndjson.ts";
import { readTextStreamLines } from "@/lib/stream-lines.ts";
import { ParseError } from "@/lib/errors.ts";

export type LakehouseAppendOptions = {
  sync?: boolean;
};

export type LakehouseAutocompleteOptions = {
  statement: string;
  catalog?: string;
  schema?: string;
  sessionId?: string;
  maxSuggestions?: number;
};

type LakehouseQueryStream = {
  metadata: LakehouseQueryMetadata;
  columns: string[] | LakehouseColumn[];
  rows: AsyncIterable<LakehouseRow>;
};

function buildLakehouseQueryPayload(
  statement: string,
  queryId?: string,
  sessionId?: string,
): Record<string, string> {
  const payload: Record<string, string> = { statement };
  if (queryId) {
    payload.query_id = queryId;
  }
  if (sessionId) {
    payload.session_id = sessionId;
  }
  return payload;
}

function parseRowLine(line: string, lineNumber: number): LakehouseRow {
  try {
    return JSON.parse(line) as LakehouseRow;
  } catch (error) {
    throw new ParseError(`Failed to parse query response at line ${lineNumber}.`, {
      details: line,
      cause: error,
    });
  }
}

async function lakehouseRequest(
  method: string,
  endpoint: string,
  body?: string | Blob | ReadableStream,
  contentType?: string,
  httpOptions?: Partial<HttpSendOptions>,
): Promise<string> {
  const session = getCliRuntime().session;
  const url = `${session?.apiBase ?? resolveApiBase()}${endpoint}`;
  const authHeader = session?.lakehouseAuthHeader ?? getLakehouseAuthHeader();
  return httpSend({
    method,
    url,
    authHeader,
    body,
    contentType,
    authPlane: "lakehouse",
    ...httpOptions,
  });
}

export async function lakehouseQuery(
  statement: string,
  queryId?: string,
  sessionId?: string,
  httpOptions?: Partial<HttpSendOptions>,
): Promise<string> {
  return lakehouseRequest(
    "POST",
    "/query",
    JSON.stringify(buildLakehouseQueryPayload(statement, queryId, sessionId)),
    "application/json",
    httpOptions,
  );
}

export async function lakehouseValidate(
  statement: string,
  httpOptions?: Partial<HttpSendOptions>,
): Promise<string> {
  return lakehouseRequest(
    "POST",
    "/validate",
    JSON.stringify({ statement }),
    "application/json",
    httpOptions,
  );
}

export async function lakehouseAppend(
  catalog: string,
  schema: string,
  table: string,
  jsonContent: string,
  options: LakehouseAppendOptions = {},
): Promise<string> {
  const params = new URLSearchParams({
    catalog,
    schema,
    table,
  });
  if (options.sync) {
    params.set("sync", "true");
  }
  return lakehouseRequest("POST", `/append?${params.toString()}`, jsonContent);
}

export async function lakehouseUpload(
  catalog: string,
  schema: string,
  table: string,
  format: string,
  mode: string,
  filePath: string,
  primaryKey?: string,
  httpOptions?: Partial<HttpSendOptions>,
): Promise<string> {
  const params = new URLSearchParams({
    catalog,
    schema,
    table,
    format,
    mode,
  });
  if (primaryKey) {
    params.set("primary_key", primaryKey);
  }

  const file = Bun.file(filePath);
  const fileSizeBytes = file.size;
  let body: Blob | ReadableStream = file;
  let uploadProgress = createUploadProgressReporter(fileSizeBytes);

  if (shouldShowProgress() && fileSizeBytes > 0) {
    body = wrapStreamWithByteProgress(file.stream(), fileSizeBytes, (sentBytes, totalBytes) => {
      uploadProgress.report(sentBytes, totalBytes);
    });
  } else {
    uploadProgress = createUploadProgressReporter(0);
  }

  try {
    return await lakehouseRequest(
      "POST",
      `/upload?${params.toString()}`,
      body,
      "application/octet-stream",
      httpOptions,
    );
  } finally {
    uploadProgress.clear();
  }
}

function wrapStreamWithByteProgress(
  source: ReadableStream<Uint8Array>,
  totalBytes: number,
  onBytesSent: (sentBytes: number, totalBytes: number) => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let sentBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      sentBytes += value.byteLength;
      onBytesSent(sentBytes, totalBytes);
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export async function lakehouseGetQuery(queryId: string): Promise<string> {
  return lakehouseRequest("GET", `/query/${urlencode(queryId)}`, undefined, undefined, {
    retry: true,
  });
}

export async function lakehouseCancel(queryId: string, sessionId: string): Promise<string> {
  const params = new URLSearchParams({ session_id: sessionId });
  return lakehouseRequest("DELETE", `/query/${urlencode(queryId)}?${params.toString()}`);
}

export async function lakehouseGetTask(taskId: string): Promise<string> {
  return lakehouseRequest("GET", `/tasks/${urlencode(taskId)}`, undefined, undefined, {
    retry: true,
  });
}

export async function lakehouseAutocomplete(
  options: LakehouseAutocompleteOptions,
): Promise<string> {
  const payload: Record<string, string | number> = { statement: options.statement };
  if (options.catalog) {
    payload.catalog = options.catalog;
  }
  if (options.schema) {
    payload.schema = options.schema;
  }
  if (options.sessionId) {
    payload.session_id = options.sessionId;
  }
  if (options.maxSuggestions !== undefined) {
    payload.max_suggestions = options.maxSuggestions;
  }
  return lakehouseRequest("POST", "/autocomplete", JSON.stringify(payload), "application/json");
}

export async function lakehouseQueryStream(
  statement: string,
  queryId?: string,
  sessionId?: string,
  httpOptions?: Partial<HttpSendOptions>,
): Promise<LakehouseQueryStream> {
  const session = getCliRuntime().session;
  const payload = buildLakehouseQueryPayload(statement, queryId, sessionId);
  const byteStream = await httpSendStream({
    method: "POST",
    url: `${session?.apiBase ?? resolveApiBase()}/query`,
    authHeader: session?.lakehouseAuthHeader ?? getLakehouseAuthHeader(),
    body: JSON.stringify(payload),
    contentType: "application/json",
    readTimeoutMs: httpOptions?.readTimeoutMs ?? STREAM_READ_TIMEOUT_MS,
    retry: false,
    authPlane: "lakehouse",
    ...httpOptions,
  });

  const header = await parseLakehouseQueryHeader(readTextStreamLines(byteStream));
  let lineNumber = header.lineNumber;

  async function* rowIterator(): AsyncGenerator<LakehouseRow, void, undefined> {
    if (header.pendingRowLine !== undefined) {
      if (header.pendingRowLine.trim().length > 0) {
        yield parseRowLine(header.pendingRowLine, lineNumber);
        lineNumber += 1;
      }
    }

    while (true) {
      const nextLine = await header.lineIterator.next();
      if (nextLine.done) {
        break;
      }
      const line = nextLine.value;
      if (line.trim().length === 0) {
        continue;
      }
      yield parseRowLine(line, lineNumber);
      lineNumber += 1;
    }
  }

  return {
    metadata: header.metadata,
    columns: header.columns,
    rows: rowIterator(),
  };
}

export async function lakehouseQueryAll(
  statement: string,
  queryId?: string,
  sessionId?: string,
  httpOptions?: Partial<HttpSendOptions>,
): Promise<LakehouseQueryResult> {
  const queryStream = await lakehouseQueryStream(statement, queryId, sessionId, httpOptions);
  const rows: LakehouseRow[] = [];
  for await (const row of queryStream.rows) {
    rows.push(row);
  }
  return {
    metadata: queryStream.metadata,
    columns: queryStream.columns,
    rows,
  };
}
