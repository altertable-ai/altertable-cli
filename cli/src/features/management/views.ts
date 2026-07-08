import type { CatalogRow } from "@/features/management/model.ts";
import { document, section, table, type DisplayDocument } from "@/ui/document.ts";

export function buildCatalogsTableView(rows: readonly CatalogRow[]): DisplayDocument {
  return document(
    section(
      table({
        rows,
        columns: [
          { header: "SLUG", cell: (row) => row.slug, style: "accent" },
          { header: "NAME", cell: (row) => row.name, style: "strong", flex: true },
          { header: "ENGINE", cell: (row) => row.engine, style: "muted" },
          { header: "CATALOG", cell: (row) => row.catalog, style: "string", flex: true },
          { header: "TYPE", cell: (row) => row.type, style: "subtle" },
        ],
        emptyMessage: "No catalogs found.",
        options: { groupBy: (row) => row.type },
      }),
    ),
  );
}
