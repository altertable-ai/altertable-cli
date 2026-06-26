import { resolveManagementApiBase } from "@/lib/config.ts";
import { getManagementAuthHeader } from "@/lib/auth.ts";
import { httpSend, httpSendDetailed, type HttpResponseDetail } from "@/lib/http.ts";
import { getCliRuntime } from "@/lib/runtime.ts";
import { urlencode } from "@/lib/encode.ts";

function encodeManagementPath(path: string): string {
  const segments = path.split("/");
  return segments.map((segment) => (segment.length > 0 ? urlencode(segment) : "")).join("/");
}

export function encodeManagementEndpoint(endpoint: string): string {
  const queryStartIndex = endpoint.indexOf("?");
  if (queryStartIndex === -1) {
    return encodeManagementPath(endpoint);
  }

  const path = endpoint.slice(0, queryStartIndex);
  const query = endpoint.slice(queryStartIndex);
  return `${encodeManagementPath(path)}${query}`;
}

function resolveManagementUrl(endpoint: string): string {
  const session = getCliRuntime().session;
  const encodedEndpoint = encodeManagementEndpoint(endpoint);
  return `${session?.managementApiBase ?? resolveManagementApiBase()}${encodedEndpoint}`;
}

function resolveManagementAuthHeader(): string {
  const session = getCliRuntime().session;
  return session?.managementAuthHeader ?? getManagementAuthHeader();
}

export async function managementRequest(
  method: string,
  endpoint: string,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  return httpSend({
    method,
    url: resolveManagementUrl(endpoint),
    authHeader: resolveManagementAuthHeader(),
    body,
    contentType: body ? "application/json" : undefined,
    extraHeaders,
    authPlane: "management",
  });
}

export async function managementRequestDetailed(
  method: string,
  endpoint: string,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<HttpResponseDetail> {
  return httpSendDetailed({
    method,
    url: resolveManagementUrl(endpoint),
    authHeader: resolveManagementAuthHeader(),
    body,
    contentType: body ? "application/json" : undefined,
    extraHeaders,
    authPlane: "management",
  });
}
