import { spawnSync } from "node:child_process";
import {
  getLoginLakehouseCredentials,
  requireManagementEnv,
  type LakehouseCredentials,
} from "@/lib/auth.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { defineLocalCommand } from "@/lib/operation-command-builders.ts";
import { optionalStringArg } from "@/lib/operation-codec.ts";
import { fetchManagementCatalogRows } from "@/lib/management-operations.ts";
import type { CatalogRow } from "@/features/management/model.ts";
import type { OperationContext } from "@/lib/operation-command.ts";

const LOGIN_PROMPT = "Log in with 'altertable login' to use altertable duckdb.";

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function attachStatement(credentials: LakehouseCredentials, catalog: string): string {
  const connection = `user=${escapeSql(credentials.user)} password=${escapeSql(credentials.password)} catalog=${escapeSql(catalog)}`;
  return `ATTACH
'${connection}'
AS ${quoteIdentifier(catalog)} (TYPE ALTERTABLE);`;
}

export function buildDuckdbAttachSnippet(
  credentials: LakehouseCredentials,
  catalogs: string[],
): string {
  return [
    "INSTALL altertable FROM community;",
    "LOAD altertable;",
    ...catalogs.map((catalog) => attachStatement(credentials, catalog)),
  ].join("\n");
}

// Attach the requested catalog (verified against the environment) or every available one.
export function selectCatalogsToAttach(
  rows: CatalogRow[],
  requested: string | undefined,
): string[] {
  const available = [
    ...new Set(rows.map((row) => row.catalog).filter((catalog) => catalog.length > 0)),
  ];
  if (requested !== undefined) {
    if (!available.includes(requested)) {
      throw new ConfigurationError(
        `Catalog "${requested}" not found. Available catalogs: ${available.join(", ") || "none"}.`,
      );
    }
    return [requested];
  }
  if (available.length === 0) {
    throw new ConfigurationError("No catalogs found in this environment.");
  }
  return available;
}

type DuckdbInput = { catalog: string | undefined };

async function runDuckdb(input: DuckdbInput, context: OperationContext): Promise<void> {
  if (!Bun.which("duckdb")) {
    throw new ConfigurationError(
      "duckdb is not installed. Install it from https://duckdb.org/install/ and try again.",
    );
  }

  const verify = await configureVerify(["lakehouse"]);
  if (!verify.verified.lakehouse) {
    throw new ConfigurationError(LOGIN_PROMPT);
  }

  const credentials = getLoginLakehouseCredentials();
  if (!credentials) {
    throw new ConfigurationError(LOGIN_PROMPT);
  }

  const rows = await fetchManagementCatalogRows(requireManagementEnv(), context);
  const catalogs = selectCatalogsToAttach(rows, input.catalog);

  const snippet = buildDuckdbAttachSnippet(credentials, catalogs);
  const result = spawnSync("duckdb", ["-cmd", snippet], { stdio: "inherit" });
  if (result.error) {
    throw new ConfigurationError(`Failed to launch duckdb: ${result.error.message}`);
  }
}

export const duckdbCommand = defineLocalCommand<DuckdbInput>({
  id: "duckdb",
  output: "none",
  capabilities: ["management-http"],
  meta: {
    name: "duckdb",
    description: "Open a DuckDB shell attached to lakehouse catalogs (all of them by default).",
    examples: ["altertable duckdb", "altertable duckdb my_catalog"],
  },
  args: {
    catalog: {
      type: "positional",
      description: "Catalog to attach (defaults to all catalogs)",
      required: false,
    },
  },
  parse({ args }) {
    return { catalog: optionalStringArg(args, "catalog") };
  },
  local: (input, context) => runDuckdb(input, context),
});
