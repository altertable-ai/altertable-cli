import { spawnSync } from "node:child_process";
import {
  getLoginLakehouseCredentials,
  requireManagementEnv,
  type LakehouseCredentials,
} from "@/lib/auth.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { defineCommand } from "@/lib/command.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { fetchManagementCatalogRows } from "@/commands/catalogs/lib/requests.ts";
import type { CatalogRow } from "@/lib/management/model.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { readEnv } from "@/lib/env.ts";

export const duckdbCommand = defineCommand({
  meta: {
    name: "duckdb",
    commandGroup: "query",
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
  run: ({ args, execution }) =>
    runDuckdb({ catalog: optionalStringArg(args, "catalog") }, execution),
});

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

function buildDuckdbAttachSnippet(credentials: LakehouseCredentials, catalogs: string[]): string {
  return [
    "INSTALL altertable FROM community;",
    "LOAD altertable;",
    ...catalogs.map((catalog) => attachStatement(credentials, catalog)),
  ].join("\n");
}

// Attach the requested catalog (verified against the environment) or every available one.
function selectCatalogsToAttach(rows: CatalogRow[], requested: string | undefined): string[] {
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

async function runDuckdb(input: DuckdbInput, execution: ExecutionContext): Promise<void> {
  const duckdb = Bun.which("duckdb", { PATH: readEnv("PATH") });
  if (!duckdb) {
    throw new ConfigurationError(
      "duckdb is not installed. Install it from https://duckdb.org/install/ and try again.",
    );
  }

  const verify = await configureVerify(["lakehouse"]);
  if (!verify.verified.lakehouse) {
    throw new ConfigurationError(LOGIN_PROMPT);
  }

  const credentials = getLoginLakehouseCredentials(execution.profile);
  if (!credentials) {
    throw new ConfigurationError(LOGIN_PROMPT);
  }

  const rows = await fetchManagementCatalogRows(requireManagementEnv(execution.profile), execution);
  const catalogs = selectCatalogsToAttach(rows, input.catalog);

  const snippet = buildDuckdbAttachSnippet(credentials, catalogs);
  const result = spawnSync(duckdb, ["-cmd", snippet], { stdio: "inherit" });
  if (result.error) {
    throw new ConfigurationError(`Failed to launch duckdb: ${result.error.message}`);
  }
}
