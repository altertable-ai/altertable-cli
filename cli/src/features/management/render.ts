import type { CatalogRow, WhoamiResponse } from "@/features/management/model.ts";
import { buildCatalogsTableView } from "@/features/management/views.ts";
import { renderDocumentText } from "@/ui/renderers/terminal.ts";

export function formatWhoamiPrincipalLine(data: WhoamiResponse): string {
  const principal = data.principal ?? {};
  if (principal.type === "ServiceAccount") {
    return `Service account: ${principal.name ?? ""} (${principal.slug ?? ""})`;
  }
  if (principal.email) {
    return `User: ${principal.name ?? ""} <${principal.email}>`;
  }
  return `User: ${principal.name ?? ""}`;
}

export function formatCatalogsSummary(rows: CatalogRow[]): string | null {
  if (rows.length === 0) {
    return null;
  }

  const databaseCount = rows.filter((row) => row.type === "database").length;
  const connectionCount = rows.filter((row) => row.type === "connection").length;
  const catalogLabel = rows.length === 1 ? "catalog" : "catalogs";
  const summaryParts = [`${rows.length} ${catalogLabel}`];

  if (databaseCount > 0) {
    const databaseLabel = databaseCount === 1 ? "database" : "databases";
    summaryParts.push(`${databaseCount} ${databaseLabel}`);
  }
  if (connectionCount > 0) {
    const connectionLabel = connectionCount === 1 ? "connection" : "connections";
    summaryParts.push(`${connectionCount} ${connectionLabel}`);
  }

  return summaryParts.join(" · ");
}

export function formatCatalogsTable(rows: CatalogRow[]): string {
  return renderDocumentText(buildCatalogsTableView(rows));
}
