import type { AuthPlane } from "@/lib/errors.ts";
import { httpSend, httpSendStream, type HttpSendOptions } from "@/lib/http.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { requirePlaneAuth, type ExecutionContext } from "@/lib/execution-context.ts";

export type OperationHttpRequest = {
  plane: AuthPlane;
  method: string;
  endpoint: string;
  body?: string | Blob | ArrayBuffer | ReadableStream;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  retry?: boolean;
  maxAttempts?: number;
};

function resolvePlaneUrl(request: OperationHttpRequest, context: ExecutionContext): string {
  if (request.plane === "management") {
    return `${context.endpoints.management}${encodeManagementEndpoint(request.endpoint)}`;
  }
  return `${context.endpoints.lakehouse}${request.endpoint}`;
}

function toHttpSendOptions(
  request: OperationHttpRequest,
  context: ExecutionContext,
): HttpSendOptions {
  return {
    method: request.method,
    url: resolvePlaneUrl(request, context),
    authHeader: requirePlaneAuth(context, request.plane),
    body: request.body,
    contentType: request.contentType,
    extraHeaders: request.extraHeaders,
    connectTimeoutMs: request.connectTimeoutMs,
    readTimeoutMs: request.readTimeoutMs,
    retry: request.retry,
    maxAttempts: request.maxAttempts,
    authPlane: request.plane,
  };
}

export function sendOperationHttp(
  request: OperationHttpRequest,
  context: ExecutionContext,
): Promise<string> {
  return httpSend(toHttpSendOptions(request, context));
}

export function sendOperationHttpStream(
  request: OperationHttpRequest,
  context: ExecutionContext,
): Promise<ReadableStream<Uint8Array>> {
  return httpSendStream(toHttpSendOptions(request, context));
}
