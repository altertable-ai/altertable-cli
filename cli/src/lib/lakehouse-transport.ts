import { type HttpSendOptions } from "@/lib/http.ts";
import { createUploadProgressReporter, shouldShowProgress } from "@/lib/progress.ts";
import type { OperationHttpRequest } from "@/lib/operation-transport.ts";

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
  format: string;
  mode: string;
  filePath: string;
  primaryKey?: string;
  httpOptions?: Partial<HttpSendOptions>;
};

export type LakehouseUploadRequestScope = {
  request: OperationHttpRequest;
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

export function buildLakehouseAppendRequest(
  input: LakehouseAppendRequestInput,
): OperationHttpRequest {
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
    format: input.format,
    mode: input.mode,
  });
  if (input.primaryKey) {
    params.set("primary_key", input.primaryKey);
  }

  const file = Bun.file(input.filePath);
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

  return {
    request: {
      plane: "lakehouse",
      method: "POST",
      endpoint: `/upload?${params.toString()}`,
      body,
      contentType: "application/octet-stream",
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
