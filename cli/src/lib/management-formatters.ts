import { renderFixedTable } from "@/lib/table-format.ts";

export type WhoamiResponse = {
  principal: {
    type?: string;
    name?: string;
    email?: string;
    slug?: string;
  };
  organization: {
    name?: string;
    slug?: string;
  };
};

export function formatWhoami(data: WhoamiResponse): string {
  const lines: string[] = [];
  const principal = data.principal ?? {};
  const organization = data.organization ?? {};

  if (principal.type === "ServiceAccount") {
    lines.push(`Service account: ${principal.name ?? ""} (${principal.slug ?? ""})`);
  } else if (principal.email) {
    lines.push(`User: ${principal.name ?? ""} <${principal.email}>`);
  } else {
    lines.push(`User: ${principal.name ?? ""}`);
  }

  lines.push(`Organization: ${organization.name ?? ""} (${organization.slug ?? ""})`);
  return lines.join("\n");
}

export type CatalogRow = {
  type: string;
  name: string;
  slug: string;
  engine: string;
  catalog: string;
};

export function formatCatalogsTable(rows: CatalogRow[]): string {
  return renderFixedTable(
    rows,
    [
      { header: "TYPE", cell: (row) => row.type },
      { header: "NAME", cell: (row) => row.name },
      { header: "SLUG", cell: (row) => row.slug },
      { header: "ENGINE", cell: (row) => row.engine },
      { header: "CATALOG", cell: (row) => row.catalog },
    ],
    "No catalogs found.",
  );
}
