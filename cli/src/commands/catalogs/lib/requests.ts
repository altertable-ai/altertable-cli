import type { HttpRequest } from "@/lib/http-request.ts";

export function buildCatalogCreateRequest(env: string, name: string): HttpRequest {
  return {
    plane: "management",
    method: "POST",
    endpoint: `/environments/${env}/databases`,
    body: JSON.stringify({ name, engine: "altertable" }),
    contentType: "application/json",
  };
}
