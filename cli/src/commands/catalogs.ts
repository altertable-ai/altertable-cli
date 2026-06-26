import { CliError } from "@/lib/errors.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCreateCatalogBody } from "@/lib/management-payloads.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { buildCatalogRows } from "@/lib/catalog-rows.ts";
import { formatCatalogsTable } from "@/lib/management-formatters.ts";
import { managementRequest } from "@/lib/management-transport.ts";

const catalogsCreateCommand = defineAltertableCommand({
  meta: {
    name: "create",
    description: "Create a catalog. Only the 'altertable' engine is supported.",
  },
  args: {
    engine: {
      type: "string",
      description: "Catalog engine (only 'altertable' is supported)",
      required: true,
    },
    name: { type: "string", description: "Catalog name", required: true },
  },
  async run({ args, sink }) {
    if (args.engine !== "altertable") {
      throw new CliError(`Only the 'altertable' engine is supported (got '${args.engine}').`);
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
  },
  async run({ sink }) {
    const rows = await buildCatalogRows();
    writeCommandOutput(
      {
        kind: "normalized",
        data: { catalogs: rows },
        humanText: formatCatalogsTable(rows),
      },
      sink,
    );
  },
});

export const catalogsCommand = defineAltertableCommand({
  meta: {
    name: "catalogs",
    description: "Manage catalogs (databases and connections) in the current environment.",
  },
  subCommands: {
    create: catalogsCreateCommand,
    list: catalogsListCommand,
  },
});
