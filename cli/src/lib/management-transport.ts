import { resolveManagementApiBase } from "@/lib/config.ts";
import { getManagementAuthHeader } from "@/lib/auth.ts";
import { httpSend } from "@/lib/http.ts";
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

export async function managementRequest(
  method: string,
  endpoint: string,
  body?: string,
): Promise<string> {
  const session = getCliRuntime().session;
  const encodedEndpoint = encodeManagementEndpoint(endpoint);
  const url = `${session?.managementApiBase ?? resolveManagementApiBase()}${encodedEndpoint}`;
  const authHeader = session?.managementAuthHeader ?? getManagementAuthHeader();
  return httpSend({
    method,
    url,
    authHeader,
    body,
    contentType: body ? "application/json" : undefined,
    authPlane: "management",
  });
}
