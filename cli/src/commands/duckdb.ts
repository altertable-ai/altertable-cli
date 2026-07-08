import { spawnSync } from "node:child_process";
import { getLoginLakehouseCredentials, type LakehouseCredentials } from "@/lib/auth.ts";
import { configureVerify } from "@/lib/configure-verify.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { defineLocalCommand } from "@/lib/operation-command-builders.ts";
import { stringArg } from "@/lib/operation-codec.ts";

const LOGIN_PROMPT = "Log in with 'altertable login' to use altertable duckdb.";

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildDuckdbAttachSnippet(
  credentials: LakehouseCredentials,
  catalog: string,
): string {
  const connection = `user=${escapeSql(credentials.user)} password=${escapeSql(credentials.password)} catalog=${escapeSql(catalog)}`;
  return `INSTALL altertable FROM community;
LOAD altertable;
ATTACH
'${connection}'
AS ${quoteIdentifier(catalog)} (TYPE ALTERTABLE);`;
}

type DuckdbInput = { catalog: string };

async function runDuckdb(input: DuckdbInput): Promise<void> {
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

  const snippet = buildDuckdbAttachSnippet(credentials, input.catalog);
  const result = spawnSync("duckdb", ["-cmd", snippet], { stdio: "inherit" });
  if (result.error) {
    throw new ConfigurationError(`Failed to launch duckdb: ${result.error.message}`);
  }
}

export const duckdbCommand = defineLocalCommand<DuckdbInput>({
  id: "duckdb",
  output: "none",
  meta: {
    name: "duckdb",
    description: "Open a DuckDB shell attached to a lakehouse catalog.",
    examples: ["altertable duckdb my_catalog"],
  },
  args: {
    catalog: { type: "positional", description: "Catalog to attach", required: true },
  },
  parse({ args }) {
    return { catalog: stringArg(args, "catalog") };
  },
  local: (input) => runDuckdb(input),
});
