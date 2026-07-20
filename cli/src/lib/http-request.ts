import { HttpError, type AuthPlane } from "@/lib/errors.ts";
import { httpSend, httpSendStream, type HttpSendOptions } from "@/lib/http.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { optionalAuth, type ExecutionContext } from "@/lib/execution-context.ts";
import { getLakehouseAuthHeader, getManagementAuthHeader } from "@/lib/auth.ts";
import { resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import { ensureFreshAccessToken, hasOAuthSession } from "@/lib/oauth-profile.ts";
import {
  canRecoverLakehouseAuth,
  hasManagementCredentials,
  provisionLakehouseCredential,
} from "@/lib/lakehouse-provision.ts";

type PlaneUrlBuilder = (endpoint: string, context: ExecutionContext) => string;

export type HttpRequest = {
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
  /**
   * Disable token refresh, lakehouse credential provisioning, and 401 recovery.
   * Intended for read-only diagnostics that must not mutate authentication state.
   */
  authRecovery?: boolean;
};

const PLANE_URL_BUILDERS = {
  lakehouse: (endpoint, context) => `${resolveApiBase(context.profile)}${endpoint}`,
  management: (endpoint, context) =>
    `${resolveManagementApiBase(context.profile)}${encodeManagementEndpoint(endpoint)}`,
} satisfies Record<AuthPlane, PlaneUrlBuilder>;

function resolvePlaneUrl(request: HttpRequest, context: ExecutionContext): string {
  return PLANE_URL_BUILDERS[request.plane](request.endpoint, context);
}

async function resolveRequestAuthHeader(
  request: HttpRequest,
  context: ExecutionContext,
): Promise<string> {
  if (request.plane === "management") {
    if (request.authRecovery !== false && hasOAuthSession(context.profile)) {
      await ensureFreshAccessToken(context.profile);
    }
    return getManagementAuthHeader(context.profile);
  }
  const existing = optionalAuth(() => getLakehouseAuthHeader(context.profile));
  if (existing) {
    return existing;
  }
  if (request.authRecovery !== false && hasManagementCredentials(context.profile)) {
    return provisionLakehouseCredential(context);
  }
  return getLakehouseAuthHeader(context.profile);
}

async function toHttpSendOptions(
  request: HttpRequest,
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

function isRecoverableLakehouseAuthFailure(
  request: HttpRequest,
  error: unknown,
  profileName: string,
): boolean {
  return (
    error instanceof HttpError &&
    error.status === 401 &&
    request.plane === "lakehouse" &&
    request.authRecovery !== false &&
    // A stream body was consumed by the failed attempt and cannot be resent.
    !(request.body instanceof ReadableStream) &&
    canRecoverLakehouseAuth(profileName)
  );
}

async function sendWithAuthRecovery<T>(
  request: HttpRequest,
  context: ExecutionContext,
  send: (options: HttpSendOptions) => Promise<T>,
): Promise<T> {
  const options = await toHttpSendOptions(request, context);
  try {
    return await send(options);
  } catch (error) {
    if (!isRecoverableLakehouseAuthFailure(request, error, context.profile)) {
      throw error;
    }
    // The server can invalidate a provisioned credential (revocation, restart)
    // before the locally stored expiry: mint a fresh one and retry once.
    const authHeader = await provisionLakehouseCredential(context);
    return send({ ...options, authHeader });
  }
}

export async function sendHttp(request: HttpRequest, context: ExecutionContext): Promise<string> {
  return sendWithAuthRecovery(request, context, httpSend);
}

export async function sendHttpStream(
  request: HttpRequest,
  context: ExecutionContext,
): Promise<ReadableStream<Uint8Array>> {
  return sendWithAuthRecovery(request, context, httpSendStream);
}
