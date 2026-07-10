import { CliError } from "@/lib/errors.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCreateCatalogBody } from "@/lib/management-payloads.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { defineGroupCommand, defineHttpCommand } from "@/lib/operation-command-builders.ts";
import { localPlan } from "@/lib/operation-effect.ts";
import { formatCatalogsSummary, formatCatalogsTable } from "@/features/management/render.ts";
import { terminalMetadata } from "@/ui/terminal/styles.ts";
import {
  fetchManagementCatalogRows,
  managementCatalogCreateOperation,
  type ManagementCatalogCreateInput,
  type ManagementCatalogCreateResult,
} from "@/lib/management-operations.ts";

const catalogsCreateCommand = defineHttpCommand({
  id: "catalogs.create",
  plane: "management",
  operation: managementCatalogCreateOperation,
  mutates: true,
  output: "raw-api",
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
  parse({ args, execution }): ManagementCatalogCreateInput {
    if (args.engine !== "altertable") {
      throw new CliError(
        `Only the 'altertable' engine is supported (got '${String(args.engine)}').`,
      );
    }

    const env = requireManagementEnv(execution.profile);
    const name = String(args.name);
    return {
      env,
      name,
      body: buildCreateCatalogBody({ name }),
    };
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
  catalog: { effects: ["local", "http"], planes: ["management"], output: "normalized" },
  meta: {
    name: "list",
    description: "List catalogs in the current environment.",
    examples: ["altertable catalogs list", "altertable --json catalogs list"],
  },
  run(_input, context) {
    const env = requireManagementEnv(context.execution.profile);
    return localPlan(() => fetchManagementCatalogRows(env, context));
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

export const catalogsCommand = defineGroupCommand({
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
