import { defineCommand } from "@/lib/command.ts";
import { catalogsCreateCommand } from "@/commands/catalogs/create.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { fetchManagementCatalogRows } from "@/lib/management/catalogs.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { formatCatalogsSummary, formatCatalogsTable } from "@/lib/management/render.ts";
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export const catalogsCommand = defineCommand({
  meta: {
    name: "catalogs",
    commandGroup: "platform",
    invocations: ["direct", "subcommand"],
    description: "Manage catalogs (databases and connections) in the current environment.",
    examples: ["altertable catalogs", "altertable catalogs create Analytics"],
  },
  subCommands: {
    create: catalogsCreateCommand,
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
