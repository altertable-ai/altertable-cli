import { type HttpSendOptions } from "@/lib/http.ts";
import { createUploadProgressReporter, shouldShowProgress } from "@/lib/progress.ts";
import type { HttpRequest } from "@/lib/http-request.ts";

export type LakehouseAppendOptions = {
  sync?: boolean;
};

export type LakehouseAppendRequestInput = {
  catalog: string;
  schema: string;
  table: string;
  jsonContent: string;
  options?: LakehouseAppendOptions;
};

export type LakehouseUploadRequestInput = {
  catalog: string;
  schema: string;
  table: string;
  mode: string;
  filePath: string;
  fileSizeBytes: number;
  contentType?: string;
  httpOptions?: Partial<HttpSendOptions>;
};

export type LakehouseUpsertRequestInput = {
  catalog: string;
  schema: string;
  table: string;
  primaryKey: string;
  filePath: string;
  fileSizeBytes: number;
  contentType?: string;
  httpOptions?: Partial<HttpSendOptions>;
};

export type LakehouseUploadRequestScope = {
  request: HttpRequest;
  release: () => void;
};

export function buildLakehouseQueryPayload(
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

export function buildLakehouseAppendRequest(input: LakehouseAppendRequestInput): HttpRequest {
  const params = new URLSearchParams({
    catalog: input.catalog,
    schema: input.schema,
    table: input.table,
  });
  if (input.options?.sync) {
    params.set("sync", "true");
  }
  return {
    plane: "lakehouse",
    method: "POST",
    endpoint: `/append?${params.toString()}`,
    body: input.jsonContent,
  };
}

export function createLakehouseUploadRequest(
  input: LakehouseUploadRequestInput,
): LakehouseUploadRequestScope {
  const params = new URLSearchParams({
    catalog: input.catalog,
    schema: input.schema,
    table: input.table,
    mode: input.mode,
  });
  return createLakehouseFileRequest(input, `/upload?${params.toString()}`);
}

export function createLakehouseUpsertRequest(
  input: LakehouseUpsertRequestInput,
): LakehouseUploadRequestScope {
  const params = new URLSearchParams({
    catalog: input.catalog,
    schema: input.schema,
    table: input.table,
    primary_key: input.primaryKey,
  });
  return createLakehouseFileRequest(input, `/upsert?${params.toString()}`);
}

function createLakehouseFileRequest(
  input: LakehouseUploadRequestInput | LakehouseUpsertRequestInput,
  endpoint: string,
): LakehouseUploadRequestScope {
  const file = Bun.file(input.filePath);
  let body: Blob | ReadableStream = input.contentType ? file : file.stream();
  let uploadProgress = createUploadProgressReporter(input.fileSizeBytes);

  if (shouldShowProgress() && input.fileSizeBytes > 0) {
    body = wrapStreamWithByteProgress(
      file.stream(),
      input.fileSizeBytes,
      (sentBytes, totalBytes) => {
        uploadProgress.report(sentBytes, totalBytes);
      },
    );
  } else {
    uploadProgress = createUploadProgressReporter(0);
  }

  return {
    request: {
      plane: "lakehouse",
      method: "POST",
      endpoint,
      body,
      contentType: input.contentType,
      ...input.httpOptions,
    },
    release: () => uploadProgress.clear(),
  };
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
