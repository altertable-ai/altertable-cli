import { CliError } from "@/lib/errors.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCreateCatalogBody } from "@/lib/management-payloads.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { allEffects, operationPlan } from "@/lib/operation-effect.ts";
import { formatCatalogsSummary, formatCatalogsTable } from "@/lib/management-formatters.ts";
import { terminalMetadata } from "@/lib/terminal-style.ts";
import {
  buildManagementCatalogRows,
  managementCatalogConnectionsOperation,
  managementCatalogCreateOperation,
  managementCatalogDatabasesOperation,
  type ManagementCatalogCreateInput,
  type ManagementCatalogCreateResult,
} from "@/lib/management-operations.ts";

const catalogsCreateCommand = defineOperationCommand({
  id: "catalogs.create",
  capabilities: ["management-http"],
  catalog: { effects: ["http"], planes: ["management"], mutates: true, output: "raw-api" },
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
  parse({ args }): ManagementCatalogCreateInput {
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
  run(input, context) {
    return managementCatalogCreateOperation.plan(input, context);
  },
  present(result: ManagementCatalogCreateResult) {
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
  catalog: { effects: ["all", "http"], planes: ["management"], output: "normalized" },
  meta: {
    name: "list",
    description: "List catalogs in the current environment.",
    examples: ["altertable catalogs list", "altertable --json catalogs list"],
  },
  run(_input, context) {
    const env = requireManagementEnv();
    return operationPlan(
      allEffects(
        [
          managementCatalogDatabasesOperation.effect(env, context),
          managementCatalogConnectionsOperation.effect(env, context),
        ],
        buildManagementCatalogRows,
      ),
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
