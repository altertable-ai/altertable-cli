import { parseApiJson } from "@/lib/parse-api-json.ts";
import { type CatalogRow, formatCatalogsTable } from "@/lib/management-formatters.ts";

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

export function buildCatalogRowsFromResponses(
  databasesResponse: string,
  connectionsResponse: string,
): CatalogRow[] {
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
