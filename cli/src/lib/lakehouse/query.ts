import type { ExecutionContext } from "@/lib/execution-context.ts";
import {
  parseLakehouseQueryResponse,
  parseLakehouseQueryStream,
  type LakehouseQueryResult,
} from "@/lib/lakehouse-ndjson.ts";
import { sendHttp, sendHttpStream, type HttpRequest } from "@/lib/http-request.ts";
import { STREAM_READ_TIMEOUT_MS } from "@/lib/transport-defaults.ts";

export type LakehouseApiQueryFormat = "csv" | "jsonl" | "parquet";

export const LAKEHOUSE_COMPUTE_SIZES = ["XS", "S", "M", "L", "XL", "AUTO"] as const;
export type LakehouseComputeSize = (typeof LAKEHOUSE_COMPUTE_SIZES)[number];

export type LakehouseQueryInput = {
  statement: string;
  queryId?: string;
  sessionId?: string;
  computeSize?: LakehouseComputeSize;
  format?: LakehouseApiQueryFormat;
  dialect?: string;
  catalog?: string;
  schema?: string;
  httpOptions?: { readTimeoutMs?: number };
};

export type LakehouseCancelInput = {
  queryId: string;
  sessionId: string;
};

function buildQueryPayload(input: LakehouseQueryInput): Record<string, string> {
  const payload: Record<string, string> = { statement: input.statement };
  if (input.queryId) payload.query_id = input.queryId;
  if (input.sessionId) payload.session_id = input.sessionId;
  if (input.computeSize) payload.compute_size = input.computeSize;
  if (input.format) payload.format = input.format;
  if (input.dialect) payload.dialect = input.dialect;
  if (input.catalog) payload.catalog = input.catalog;
  if (input.schema) payload.schema = input.schema;
  return payload;
}

export function buildLakehouseQueryRequest(
  input: LakehouseQueryInput,
  streaming: boolean,
): HttpRequest {
  return {
    plane: "lakehouse",
    method: "POST",
    endpoint: "/query",
    body: JSON.stringify(buildQueryPayload(input)),
    contentType: "application/json",
    ...(streaming
      ? {
          readTimeoutMs: input.httpOptions?.readTimeoutMs ?? STREAM_READ_TIMEOUT_MS,
          retry: false,
        }
      : {}),
    ...input.httpOptions,
  };
}

async function collectQueryStream(
  stream: ReadableStream<Uint8Array>,
): Promise<LakehouseQueryResult> {
  const parser = parseLakehouseQueryStream(stream);
  while (true) {
    const next = await parser.next();
    if (next.done) return next.value;
  }
}

export async function executeLakehouseQuery(
  input: LakehouseQueryInput,
  execution: ExecutionContext,
  streaming: boolean,
): Promise<LakehouseQueryResult> {
  const request = buildLakehouseQueryRequest(input, streaming);
  if (streaming) {
    return collectQueryStream(await sendHttpStream(request, execution));
  }
  return parseLakehouseQueryResponse(await sendHttp(request, execution));
}

export async function executeLakehouseQueryBytes(
  input: LakehouseQueryInput,
  execution: ExecutionContext,
): Promise<ReadableStream<Uint8Array>> {
  return sendHttpStream(buildLakehouseQueryRequest(input, true), execution);
}

export function buildLakehouseQueryShowRequest(queryId: string): HttpRequest {
  return {
    plane: "lakehouse",
    method: "GET",
    endpoint: `/query/${encodeURIComponent(queryId)}`,
    retry: true,
  };
}

export function buildLakehouseQueryCancelRequest(input: LakehouseCancelInput): HttpRequest {
  const params = new URLSearchParams({ session_id: input.sessionId });
  return {
    plane: "lakehouse",
    method: "DELETE",
    endpoint: `/query/${encodeURIComponent(input.queryId)}?${params.toString()}`,
  };
}

export function buildLakehouseVerifyRequest(): HttpRequest {
  return buildLakehouseQueryRequest({ statement: "SELECT 1" }, false);
}
