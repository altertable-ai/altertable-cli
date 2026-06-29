import { parseApiJson } from "@/lib/parse-api-json.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { type CatalogRow, formatCatalogsTable } from "@/lib/management-formatters.ts";
import { managementRequest } from "@/lib/management-transport.ts";

type CatalogRowsRequest = (method: string, endpoint: string) => Promise<string>;

type DatabaseSummary = {
  name?: string;
  slug?: string;
  engine?: string;
  catalog?: string;
};

type ConnectionSummary = {
  name?: string;
  slug?: string;
  engine?: string;
  catalog?: string;
};

export async function buildCatalogRows(
  env?: string,
  request: CatalogRowsRequest = managementRequest,
): Promise<CatalogRow[]> {
  const environment = env ?? requireManagementEnv();
  const databasesResponse = await request("GET", `/environments/${environment}/databases`);
  const connectionsResponse = await request("GET", `/environments/${environment}/connections`);

  const databases = parseApiJson(databasesResponse) as { databases?: DatabaseSummary[] };
  const connections = parseApiJson(connectionsResponse) as { connections?: ConnectionSummary[] };

  const rows: CatalogRow[] = [];
  for (const database of databases.databases ?? []) {
    rows.push({
      type: "database",
      name: database.name ?? "",
      slug: database.slug ?? "",
      engine: "altertable",
      catalog: database.catalog ?? "",
    });
  }
  for (const connection of connections.connections ?? []) {
    rows.push({
      type: "connection",
      name: connection.name ?? "",
      slug: connection.slug ?? "",
      engine: connection.engine ?? "",
      catalog: connection.catalog ?? "",
    });
  }
  return rows;
}

export { formatCatalogsTable };
