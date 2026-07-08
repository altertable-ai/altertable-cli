import type { CatalogRow, WhoamiResponse } from "@/features/management/model.ts";
import { renderFixedTableSection } from "@/ui/terminal/table-layout.ts";

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
  return renderFixedTableSection(
    rows,
    [
      { header: "SLUG", cell: (row) => row.slug, style: "accent" },
      { header: "NAME", cell: (row) => row.name, style: "strong", flex: true },
      { header: "ENGINE", cell: (row) => row.engine, style: "muted" },
      { header: "CATALOG", cell: (row) => row.catalog, style: "string", flex: true },
      { header: "TYPE", cell: (row) => row.type, style: "subtle" },
    ],
    "No catalogs found.",
    { groupBy: (row) => row.type },
  );
}
