import { requireManagementEnv } from "@/lib/auth.ts";
import { fetchManagementCatalogRows } from "@/commands/catalogs/lib/requests.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { formatCatalogsSummary, formatCatalogsTable } from "@/lib/management/render.ts";
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export const catalogsListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List catalogs in the current environment.",
    examples: ["altertable catalogs list", "altertable --json catalogs list"],
  },
  async run({ execution, sink }) {
    const rows = await fetchManagementCatalogRows(
      requireManagementEnv(execution.profile),
      execution,
    );
    const summary = formatCatalogsSummary(rows);
    await writeCommandOutput(
      {
        kind: "normalized",
        data: { catalogs: rows, ...(summary !== null ? { summary } : {}) },
        humanText: formatCatalogsTable(rows),
        metadataLines:
          summary !== null ? ["", renderDisplayText([span(summary, "subtle")])] : undefined,
      },
      sink,
    );
  },
});
