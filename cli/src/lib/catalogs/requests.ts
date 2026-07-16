import { buildCatalogRowsFromResponses } from "@/lib/catalog-rows.ts";
import type { CatalogRow } from "@/features/management/model.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { sendHttp, type HttpRequest } from "@/lib/http-request.ts";

export function buildCatalogCreateRequest(env: string, body: string): HttpRequest {
  return {
    plane: "management",
    method: "POST",
    endpoint: `/environments/${env}/databases`,
    body,
    contentType: "application/json",
  };
}

function buildCatalogListRequest(env: string, kind: "databases" | "connections") {
  return {
    plane: "management" as const,
    method: "GET",
    endpoint: `/environments/${env}/${kind}`,
  };
}

export async function fetchManagementCatalogRows(
  env: string,
  execution: ExecutionContext,
): Promise<CatalogRow[]> {
  const [databasesResponse, connectionsResponse] = await Promise.all([
    sendHttp(buildCatalogListRequest(env, "databases"), execution),
    sendHttp(buildCatalogListRequest(env, "connections"), execution),
  ]);
  return buildCatalogRowsFromResponses(databasesResponse, connectionsResponse);
}
