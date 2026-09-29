import { defineCommand } from "@/lib/command.ts";
import { catalogsCreateCommand } from "@/commands/catalogs/create.ts";
import { requireManagementPlane } from "@/lib/auth.ts";
import { fetchManagementCatalogRows } from "@/lib/management/catalogs.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { formatCatalogsSummary, formatCatalogsTable } from "@/lib/management/render.ts";
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export const catalogCommand = defineCommand({
  metadata: {
    name: "catalog",
    commandGroup: "platform",
    invocations: ["direct", "subcommand"],
    description: "Manage catalogs (databases and connections) in the current environment.",
    examples: ["altertable catalog", "altertable catalog create Analytics"],
  },
  subcommands: {
    create: catalogsCreateCommand,
  },
  async run({ execution, sink }) {
    const rows = await fetchManagementCatalogRows(
      requireManagementPlane(execution.profile, {
        requirement: "Listing catalogs requires the management API",
      }),
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

export const catalogsCommand = defineCommand({
  ...catalogCommand,
  metadata: {
    name: "catalogs",
    hidden: true,
    description: "Alias for altertable catalog.",
    invocations: ["direct", "subcommand"],
  },
});
