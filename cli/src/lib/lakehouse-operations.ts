import { urlencode } from "@/lib/encode.ts";
import { defineHttpOperation, defineHttpStreamOperation } from "@/lib/http-operation.ts";
import {
  parseLakehouseQueryResponse,
  parseLakehouseQueryStream,
  type LakehouseQueryResult,
} from "@/lib/lakehouse-ndjson.ts";
import { buildLakehouseAppendRequest } from "@/lib/lakehouse-transport.ts";
import { STREAM_READ_TIMEOUT_MS } from "@/lib/transport-defaults.ts";

export type LakehouseQueryOperationInput = {
  statement: string;
  queryId?: string;
  sessionId?: string;
  httpOptions?: { readTimeoutMs?: number };
};

export type LakehouseCancelOperationInput = {
  queryId: string;
  sessionId: string;
};

export type LakehouseValidateOperationInput = {
  statement: string;
  httpOptions?: { readTimeoutMs?: number };
};

export type LakehouseAppendOperationInput = {
  catalog: string;
  schema: string;
  table: string;
  payload: string;
  sync: boolean;
};

export type LakehouseAutocompleteOperationInput = {
  statement: string;
  catalog?: string;
  schema?: string;
  sessionId?: string;
  maxSuggestions?: number;
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

export const lakehouseQueryOperation = defineHttpOperation<
  LakehouseQueryOperationInput,
  LakehouseQueryResult
>({
  id: "lakehouse.query.run.buffered",
  request: (input) => ({
    plane: "lakehouse",
    method: "POST",
    endpoint: "/query",
    body: JSON.stringify(
      buildLakehouseQueryPayload(input.statement, input.queryId, input.sessionId),
    ),
    contentType: "application/json",
    ...input.httpOptions,
  }),
  decode: (response) => parseLakehouseQueryResponse(response),
});

export const lakehouseQueryStreamOperation = defineHttpStreamOperation<
  LakehouseQueryOperationInput,
  LakehouseQueryResult
>({
  id: "lakehouse.query.run.stream",
  request: (input) => ({
    plane: "lakehouse",
    method: "POST",
    endpoint: "/query",
    body: JSON.stringify(
      buildLakehouseQueryPayload(input.statement, input.queryId, input.sessionId),
    ),
    contentType: "application/json",
    readTimeoutMs: input.httpOptions?.readTimeoutMs ?? STREAM_READ_TIMEOUT_MS,
    retry: false,
    ...input.httpOptions,
  }),
  decode: (stream) => collectLakehouseQueryStream(stream),
});

export const lakehouseQueryShowOperation = defineHttpOperation<string, string>({
  id: "lakehouse.query.show",
  request: (queryId) => ({
    plane: "lakehouse",
    method: "GET",
    endpoint: `/query/${urlencode(queryId)}`,
    retry: true,
  }),
});

export const lakehouseQueryCancelOperation = defineHttpOperation<
  LakehouseCancelOperationInput,
  string
>({
  id: "lakehouse.query.cancel",
  request: (input) => {
    const params = new URLSearchParams({ session_id: input.sessionId });
    return {
      plane: "lakehouse",
      method: "DELETE",
      endpoint: `/query/${urlencode(input.queryId)}?${params.toString()}`,
    };
  },
});

export const lakehouseValidateOperation = defineHttpOperation<
  LakehouseValidateOperationInput,
  string
>({
  id: "lakehouse.validate",
  request: (input) => ({
    plane: "lakehouse",
    method: "POST",
    endpoint: "/validate",
    body: JSON.stringify({ statement: input.statement }),
    contentType: "application/json",
    ...input.httpOptions,
  }),
});

export const lakehouseVerifyOperation = defineHttpOperation<void, string>({
  id: "lakehouse.verify",
  request: () => ({
    plane: "lakehouse",
    method: "POST",
    endpoint: "/query",
    body: JSON.stringify(buildLakehouseQueryPayload("SELECT 1")),
    contentType: "application/json",
  }),
});

export const lakehouseAppendOperation = defineHttpOperation<LakehouseAppendOperationInput, string>({
  id: "lakehouse.append.run",
  request: (input) =>
    buildLakehouseAppendRequest({
      catalog: input.catalog,
      schema: input.schema,
      table: input.table,
      jsonContent: input.payload,
      options: { sync: input.sync },
    }),
});

export const lakehouseAppendTaskOperation = defineHttpOperation<string, string>({
  id: "lakehouse.append.task",
  request: (taskId) => ({
    plane: "lakehouse",
    method: "GET",
    endpoint: `/tasks/${urlencode(taskId)}`,
    retry: true,
  }),
});

export const lakehouseAutocompleteOperation = defineHttpOperation<
  LakehouseAutocompleteOperationInput,
  string
>({
  id: "lakehouse.autocomplete",
  request: (input) => {
    const payload: Record<string, string | number> = { statement: input.statement };
    if (input.catalog) {
      payload.catalog = input.catalog;
    }
    if (input.schema) {
      payload.schema = input.schema;
    }
    if (input.sessionId) {
      payload.session_id = input.sessionId;
    }
    if (input.maxSuggestions !== undefined) {
      payload.max_suggestions = input.maxSuggestions;
    }
    return {
      plane: "lakehouse",
      method: "POST",
      endpoint: "/autocomplete",
      body: JSON.stringify(payload),
      contentType: "application/json",
    };
  },
});
