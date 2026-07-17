import type { ExecutionContext } from "@/lib/execution-context.ts";
import { sendHttp } from "@/lib/http-request.ts";
import type { CatalogRow } from "@/lib/management/model.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";

type CatalogSummary = {
  name?: string;
  slug?: string;
  engine?: string;
  catalog?: string;
};

function catalogListRequest(environment: string, kind: "databases" | "connections") {
  return {
    plane: "management" as const,
    method: "GET",
    endpoint: `/environments/${environment}/${kind}`,
  };
}

function parseCatalogRows(databasesResponse: string, connectionsResponse: string): CatalogRow[] {
  const databases = parseApiJson(databasesResponse) as { databases?: CatalogSummary[] };
  const connections = parseApiJson(connectionsResponse) as { connections?: CatalogSummary[] };

  return [
    ...(databases.databases ?? []).map((database) => ({
      type: "database" as const,
      name: database.name ?? "",
      slug: database.slug ?? "",
      engine: "altertable",
      catalog: database.catalog ?? "",
    })),
    ...(connections.connections ?? []).map((connection) => ({
      type: "connection" as const,
      name: connection.name ?? "",
      slug: connection.slug ?? "",
      engine: connection.engine ?? "",
      catalog: connection.catalog ?? "",
    })),
  ];
}

export async function fetchManagementCatalogRows(
  environment: string,
  execution: ExecutionContext,
): Promise<CatalogRow[]> {
  const databasesResponse = await sendHttp(catalogListRequest(environment, "databases"), execution);
  const connectionsResponse = await sendHttp(
    catalogListRequest(environment, "connections"),
    execution,
  );
  return parseCatalogRows(databasesResponse, connectionsResponse);
}
