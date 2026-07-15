import type { CatalogRow } from "@/features/management/model.ts";
import { document, section, span, table, type DisplayDocument } from "@/ui/document.ts";

export function buildCatalogsTableView(rows: readonly CatalogRow[]): DisplayDocument {
  return document(
    section(
      table({
        rows,
        columns: [
          { header: "SLUG", cell: (row) => [span(row.slug, "accent")] },
          { header: "NAME", cell: (row) => [span(row.name, "strong")], flex: true },
          { header: "ENGINE", cell: (row) => [span(row.engine, "muted")] },
          { header: "CATALOG", cell: (row) => [span(row.catalog, "string")], flex: true },
          { header: "TYPE", cell: (row) => [span(row.type, "subtle")] },
        ],
        emptyMessage: "No catalogs found.",
        options: { groupBy: (row) => row.type },
      }),
    ),
  );
}
