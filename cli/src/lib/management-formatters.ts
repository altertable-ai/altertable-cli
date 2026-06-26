import { renderFixedTableSection } from "@/lib/table-format.ts";
import { formatTerminalLabelValue } from "@/lib/terminal-style.ts";

const DETAIL_INDENT = "  ";
const DETAIL_LABEL_WIDTH = 17;

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

type WhoamiLabelOptions = {
  indent?: string;
  labelWidth?: number;
};

export function formatWhoamiIdentityLines(
  data: WhoamiResponse,
  labelOptions: WhoamiLabelOptions = {},
): string[] {
  const principal = data.principal ?? {};
  const organization = data.organization ?? {};
  const options = {
    indent: labelOptions.indent ?? DETAIL_INDENT,
    labelWidth: labelOptions.labelWidth ?? DETAIL_LABEL_WIDTH,
  };

  const lines: string[] = [];

  if (principal.type === "ServiceAccount") {
    lines.push(
      formatTerminalLabelValue(
        "Service account:",
        `${principal.name ?? ""} (${principal.slug ?? ""})`,
        options,
      ),
    );
  } else if (principal.email) {
    lines.push(
      formatTerminalLabelValue("User:", `${principal.name ?? ""} <${principal.email}>`, options),
    );
  } else if (principal.name) {
    lines.push(formatTerminalLabelValue("User:", principal.name, options));
  }

  if (organization.name || organization.slug) {
    lines.push(
      formatTerminalLabelValue(
        "Organization:",
        `${organization.name ?? ""} (${organization.slug ?? ""})`,
        options,
      ),
    );
  }

  return lines;
}

export type CatalogRow = {
  type: string;
  name: string;
  slug: string;
  engine: string;
  catalog: string;
};

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
