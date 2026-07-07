import { HttpError, type AuthPlane } from "@/lib/errors.ts";
import { httpSend, httpSendStream, type HttpSendOptions } from "@/lib/http.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { requirePlaneAuth, type ExecutionContext } from "@/lib/execution-context.ts";
import { getManagementAuthHeader } from "@/lib/auth.ts";
import { ensureFreshAccessToken, hasOAuthSession } from "@/lib/oauth-profile.ts";
import {
  canRecoverLakehouseAuth,
  hasManagementCredentials,
  provisionLakehouseCredential,
} from "@/lib/lakehouse-provision.ts";

type PlaneUrlBuilder = (endpoint: string, context: ExecutionContext) => string;

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

const PLANE_URL_BUILDERS = {
  lakehouse: (endpoint, context) => `${context.endpoints.lakehouse}${endpoint}`,
  management: (endpoint, context) =>
    `${context.endpoints.management}${encodeManagementEndpoint(endpoint)}`,
} satisfies Record<AuthPlane, PlaneUrlBuilder>;

function resolvePlaneUrl(request: OperationHttpRequest, context: ExecutionContext): string {
  return PLANE_URL_BUILDERS[request.plane](request.endpoint, context);
}

async function resolveRequestAuthHeader(
  request: OperationHttpRequest,
  context: ExecutionContext,
): Promise<string> {
  if (request.plane === "management" && hasOAuthSession()) {
    await ensureFreshAccessToken();
    return getManagementAuthHeader();
  }
  if (request.plane === "lakehouse" && !context.auth.lakehouse && hasManagementCredentials()) {
    const header = await provisionLakehouseCredential(context);
    context.auth.lakehouse = header;
    return header;
  }
  return requirePlaneAuth(context, request.plane);
}

async function toHttpSendOptions(
  request: OperationHttpRequest,
  context: ExecutionContext,
): Promise<HttpSendOptions> {
  return {
    method: request.method,
    url: resolvePlaneUrl(request, context),
    authHeader: await resolveRequestAuthHeader(request, context),
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

function isRecoverableLakehouseAuthFailure(request: OperationHttpRequest, error: unknown): boolean {
  return (
    error instanceof HttpError &&
    error.status === 401 &&
    request.plane === "lakehouse" &&
    // A stream body was consumed by the failed attempt and cannot be resent.
    !(request.body instanceof ReadableStream) &&
    canRecoverLakehouseAuth()
  );
}

async function sendWithAuthRecovery<T>(
  request: OperationHttpRequest,
  context: ExecutionContext,
  send: (options: HttpSendOptions) => Promise<T>,
): Promise<T> {
  const options = await toHttpSendOptions(request, context);
  try {
    return await send(options);
  } catch (error) {
    if (!isRecoverableLakehouseAuthFailure(request, error)) {
      throw error;
    }
    // The server can invalidate a provisioned credential (revocation, restart)
    // before the locally stored expiry: mint a fresh one and retry once.
    const authHeader = await provisionLakehouseCredential(context);
    context.auth.lakehouse = authHeader;
    return send({ ...options, authHeader });
  }
}

export async function sendOperationHttp(
  request: OperationHttpRequest,
  context: ExecutionContext,
): Promise<string> {
  return sendWithAuthRecovery(request, context, httpSend);
}

export async function sendOperationHttpStream(
  request: OperationHttpRequest,
  context: ExecutionContext,
): Promise<ReadableStream<Uint8Array>> {
  return sendWithAuthRecovery(request, context, httpSendStream);
}
