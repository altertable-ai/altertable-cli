import { spawnSync } from "node:child_process";
import {
  getLakehouseCredentialPair,
  requireManagementPlane,
  type LakehouseBasicAuthPair,
} from "@/lib/auth.ts";
import { configureVerify, type ConfigureAuthPlane } from "@/lib/profile-status.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { defineCommand } from "@/lib/command.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { fetchManagementCatalogRows } from "@/lib/management/catalogs.ts";
import type { CatalogRow } from "@/lib/management/model.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { readEnv } from "@/lib/env.ts";

export const duckdbCommand = defineCommand({
  metadata: {
    name: "duckdb",
    commandGroup: "query",
    description: "Open a DuckDB shell attached to lakehouse catalogs (all of them by default).",
    examples: ["altertable duckdb", "altertable duckdb analytics"],
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

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function attachStatement(credentials: LakehouseBasicAuthPair, catalog: string): string {
  const connection = `user=${escapeSql(credentials.user)} password=${escapeSql(credentials.password)} catalog=${escapeSql(catalog)}`;
  return `ATTACH
'${connection}'
AS ${quoteIdentifier(catalog)} (TYPE ALTERTABLE);`;
}

function buildDuckdbAttachSnippet(credentials: LakehouseBasicAuthPair, catalogs: string[]): string {
  return [
    "INSTALL altertable FROM community;",
    "LOAD altertable;",
    ...catalogs.map((catalog) => attachStatement(credentials, catalog)),
  ].join("\n");
}

function availableCatalogs(rows: CatalogRow[]): string[] {
  const available = [
    ...new Set(rows.map((row) => row.catalog).filter((catalog) => catalog.length > 0)),
  ];
  if (available.length === 0) {
    throw new ConfigurationError("No catalogs found in this environment.");
  }
  return available;
}

async function verifyConfiguredPlanes(
  planes: ConfigureAuthPlane[],
  execution: ExecutionContext,
): Promise<void> {
  const verify = await configureVerify(planes, execution);
  const failedPlane = verify.configured.find((plane) => !verify.verified[plane]);
  if (failedPlane) {
    const detail = verify.errors.find((error) => error.plane === failedPlane)?.message;
    throw new ConfigurationError(detail ?? `${failedPlane} credentials verification failed.`);
  }
}

type DuckdbAttachPlan = { credentials: LakehouseBasicAuthPair; catalogs: string[] };

// Attaching one named catalog needs only lakehouse credentials; the catalog is
// not validated against the management API and a typo surfaces from DuckDB.
async function duckdbAttachSingleCatalog(
  catalog: string,
  execution: ExecutionContext,
): Promise<DuckdbAttachPlan> {
  await verifyConfiguredPlanes(["lakehouse"], execution);
  return { credentials: getLakehouseCredentialPair(execution.profile), catalogs: [catalog] };
}

async function duckdbAttachAll(execution: ExecutionContext): Promise<DuckdbAttachPlan> {
  const managementEnv = requireManagementPlane(execution.profile, {
    requirement: "Attaching all catalogs requires the management API to list them",
    alternative: "attach a single catalog directly: altertable duckdb <catalog>",
  });
  await verifyConfiguredPlanes(["management", "lakehouse"], execution);
  const credentials = getLakehouseCredentialPair(execution.profile);
  const rows = await fetchManagementCatalogRows(managementEnv, execution);
  return { credentials, catalogs: availableCatalogs(rows) };
}

type DuckdbInput = { catalog: string | undefined };

async function runDuckdb(input: DuckdbInput, execution: ExecutionContext): Promise<void> {
  const duckdb = Bun.which("duckdb", { PATH: readEnv("PATH") });
  if (!duckdb) {
    throw new ConfigurationError(
      "duckdb is not installed. Install it from https://duckdb.org/install/ and try again.",
    );
  }

  const plan =
    input.catalog === undefined
      ? await duckdbAttachAll(execution)
      : await duckdbAttachSingleCatalog(input.catalog, execution);

  const snippet = buildDuckdbAttachSnippet(plan.credentials, plan.catalogs);
  const result = spawnSync(duckdb, ["-cmd", snippet], { stdio: "inherit" });
  if (result.error) {
    throw new ConfigurationError(`Failed to launch duckdb: ${result.error.message}`);
  }
}
