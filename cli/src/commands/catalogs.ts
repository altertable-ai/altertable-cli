import { CliError } from "@/lib/errors.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCreateCatalogBody } from "@/lib/management-payloads.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { buildCatalogRows } from "@/lib/catalog-rows.ts";
import { formatCatalogsSummary, formatCatalogsTable } from "@/lib/management-formatters.ts";
import { terminalMetadata } from "@/lib/terminal-style.ts";
import { managementRequest } from "@/lib/management-transport.ts";

const catalogsCreateCommand = defineAltertableCommand({
  meta: {
    name: "create",
    description: "Create a catalog. Only the 'altertable' engine is supported.",
    examples: ["altertable catalogs create --engine altertable --name Analytics"],
  },
  args: {
    engine: {
      type: "enum",
      description: "Catalog engine (only 'altertable' is supported)",
      required: true,
      options: ["altertable"],
    },
    name: { type: "string", description: "Catalog name", required: true },
  },
  async run({ args, sink }) {
    if (args.engine !== "altertable") {
      throw new CliError(
        `Only the 'altertable' engine is supported (got '${String(args.engine)}').`,
      );
    }

    const env = requireManagementEnv();
    const body = buildCreateCatalogBody({ name: String(args.name) });
    const response = await managementRequest("POST", `/environments/${env}/databases`, body);
    const data = parseApiJson(response) as {
      database?: { slug?: string; name?: string; engine?: string };
      connection?: { slug?: string; name?: string; engine?: string };
    };
    const catalog = data.database ?? data.connection;
    const name = catalog?.name ?? String(args.name);
    const slug = catalog?.slug ?? "";
    const engine = catalog?.engine ?? "altertable";
    writeCommandOutput(
      {
        kind: "raw_api",
        body: response,
        humanFormatter: () =>
          `Created catalog "${name}" (slug: ${slug}, engine: ${engine}, environment: ${env}).`,
      },
      sink,
    );
  },
});

const catalogsListCommand = defineAltertableCommand({
  meta: {
    name: "list",
    description: "List catalogs in the current environment.",
    examples: ["altertable catalogs list", "altertable --json catalogs list"],
  },
  async run({ sink }) {
    const rows = await buildCatalogRows();
    const summary = formatCatalogsSummary(rows);
    writeCommandOutput(
      {
        kind: "normalized",
        data: {
          catalogs: rows,
          ...(summary !== null ? { summary } : {}),
        },
        humanText: formatCatalogsTable(rows),
        metadataLines: summary !== null ? ["", terminalMetadata(summary)] : undefined,
      },
      sink,
    );
  },
});

export const catalogsCommand = defineAltertableCommand({
  meta: {
    name: "catalogs",
    description: "Manage catalogs (databases and connections) in the current environment.",
    examples: [
      "altertable catalogs list",
      "altertable catalogs create --engine altertable --name Analytics",
    ],
  },
  subCommands: {
    create: catalogsCreateCommand,
    list: catalogsListCommand,
  },
});
