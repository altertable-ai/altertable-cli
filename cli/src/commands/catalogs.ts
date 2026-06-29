import { CliError } from "@/lib/errors.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCreateCatalogBody } from "@/lib/management-payloads.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { buildCatalogRowsFromResponses } from "@/lib/catalog-rows.ts";
import { allEffects, httpEffect } from "@/lib/operation-effect.ts";
import { formatCatalogsSummary, formatCatalogsTable } from "@/lib/management-formatters.ts";
import { terminalMetadata } from "@/lib/terminal-style.ts";

type CatalogCreateInput = {
  env: string;
  name: string;
  body: string;
};

type CatalogCreateResult = {
  response: string;
  env: string;
  fallbackName: string;
};

const catalogsCreateCommand = defineOperationCommand({
  id: "catalogs.create",
  capabilities: ["management-http"],
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
  parse({ args }): CatalogCreateInput {
    if (args.engine !== "altertable") {
      throw new CliError(
        `Only the 'altertable' engine is supported (got '${String(args.engine)}').`,
      );
    }

    const env = requireManagementEnv();
    const name = String(args.name);
    return {
      env,
      name,
      body: buildCreateCatalogBody({ name }),
    };
  },
  run(input) {
    return httpEffect<CatalogCreateResult>(
      {
        plane: "management",
        method: "POST",
        endpoint: `/environments/${input.env}/databases`,
        body: input.body,
        contentType: "application/json",
      },
      (response) => ({ response, env: input.env, fallbackName: input.name }),
    );
  },
  present(result) {
    const data = parseApiJson(result.response) as {
      database?: { slug?: string; name?: string; engine?: string };
      connection?: { slug?: string; name?: string; engine?: string };
    };
    const catalog = data.database ?? data.connection;
    const name = catalog?.name ?? result.fallbackName;
    const slug = catalog?.slug ?? "";
    const engine = catalog?.engine ?? "altertable";
    return {
      kind: "raw_api",
      body: result.response,
      humanFormatter: () =>
        `Created catalog "${name}" (slug: ${slug}, engine: ${engine}, environment: ${result.env}).`,
    };
  },
});

const catalogsListCommand = defineOperationCommand({
  id: "catalogs.list",
  capabilities: ["management-http"],
  meta: {
    name: "list",
    description: "List catalogs in the current environment.",
    examples: ["altertable catalogs list", "altertable --json catalogs list"],
  },
  run() {
    const env = requireManagementEnv();
    return allEffects(
      [
        httpEffect({
          plane: "management",
          method: "GET",
          endpoint: `/environments/${env}/databases`,
        }),
        httpEffect({
          plane: "management",
          method: "GET",
          endpoint: `/environments/${env}/connections`,
        }),
      ],
      ([databasesResponse, connectionsResponse]) =>
        buildCatalogRowsFromResponses(String(databasesResponse), String(connectionsResponse)),
    );
  },
  present(rows) {
    const summary = formatCatalogsSummary(rows);
    return {
      kind: "normalized",
      data: {
        catalogs: rows,
        ...(summary !== null ? { summary } : {}),
      },
      humanText: formatCatalogsTable(rows),
      metadataLines: summary !== null ? ["", terminalMetadata(summary)] : undefined,
    };
  },
});

export const catalogsCommand = defineOperationCommand({
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
