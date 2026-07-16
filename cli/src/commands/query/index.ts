import type { ArgsDef, CommandDef } from "citty";
import { optionalStringArg, stringArg } from "@/lib/operation-codec.ts";
import { CliError } from "@/lib/errors.ts";
import { defineOperationCommand, type OperationContext } from "@/lib/operation-command.ts";
import { defineGroupCommand, defineHttpCommand } from "@/lib/operation-command-builders.ts";
import { normalizeDefaultSubCommandRawArgs, valueFlagsFor } from "@/lib/command-delegation.ts";
import {
  PAGER_MODE_OPTIONS,
  parseQueryOutputOptions,
  parseRequestReadTimeoutMs,
  QUERY_RESULT_FORMAT_OPTIONS,
} from "@/lib/lakehouse/args.ts";
import { QUERY_LAYOUT_OPTIONS } from "@/ui/layouts/query.ts";
import { writeQueryOutput } from "@/lib/lakehouse-client.ts";
import type { LakehouseQueryResult } from "@/lib/lakehouse-ndjson.ts";
import {
  type LakehouseQueryOperationInput,
  lakehouseQueryCancelOperation,
  lakehouseQueryOperation,
  lakehouseQueryShowOperation,
  lakehouseQueryStreamOperation,
} from "@/lib/lakehouse-operations.ts";

export const queryRunArgs = {
  statement: { type: "positional", description: "SQL statement to run", required: false },
  format: {
    type: "enum",
    description: "Output format: human, json, csv, or markdown",
    default: "human",
    options: [...QUERY_RESULT_FORMAT_OPTIONS],
  },
  layout: {
    type: "enum",
    description: "Human layout: auto, table, or line",
    options: [...QUERY_LAYOUT_OPTIONS],
  },
  "query-id": { type: "string", description: "Optional stable query id" },
  "session-id": { type: "string", description: "Optional session id" },
  columns: {
    type: "string",
    description: "Comma-separated columns to show",
  },
  "max-width": {
    type: "string",
    description: "Maximum display width for table columns",
    default: "32",
  },
  pager: {
    type: "enum",
    description: "Pager mode for human output: auto, always, or never",
    default: "auto",
    options: [...PAGER_MODE_OPTIONS],
  },
  "read-timeout": {
    type: "string",
    description: "Read timeout in seconds for this request (overrides global --read-timeout)",
  },
} satisfies ArgsDef;

const queryGroupArgs = {
  ...queryRunArgs,
} satisfies ArgsDef;

const QUERY_VALUE_FLAGS = valueFlagsFor(queryRunArgs);

export function normalizeQueryInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: ArgsDef = {},
): string[] {
  return normalizeDefaultSubCommandRawArgs(rawArgs, {
    commandName: "query",
    subCommand: "run",
    rootArgs,
    commandValueFlags: QUERY_VALUE_FLAGS,
    isReservedOperand: (value) => QUERY_SUBCOMMAND_NAMES.has(value),
  });
}

export type QueryRunInput = LakehouseQueryOperationInput &
  ReturnType<typeof parseQueryOutputOptions>;

export function planQueryRun(input: QueryRunInput, context: OperationContext) {
  if (input.format === "json" || context.sink.json) {
    return lakehouseQueryOperation.plan(input, context);
  }

  return lakehouseQueryStreamOperation.plan(input, context);
}

export async function presentQueryRun(
  result: LakehouseQueryResult,
  { sink }: OperationContext,
  input: QueryRunInput,
): Promise<void> {
  await writeQueryOutput(result, input.format, input.displayOptions, input.pagerOptions, sink);
}

const queryRunCommand = defineOperationCommand<QueryRunInput, LakehouseQueryResult>({
  id: "lakehouse.query.run",
  capabilities: ["lakehouse-http", "streaming"],
  catalog: {
    effects: ["http", "http-stream"],
    planes: ["lakehouse"],
    output: "normalized",
  },
  meta: {
    name: "run",
    description: "Run a SQL statement.",
    examples: [
      'altertable query "SELECT * FROM users LIMIT 10"',
      'altertable query "SELECT 1" --format json',
    ],
  },
  args: queryRunArgs,
  parse({ args, rawArgs }) {
    const statement = optionalStringArg(args, "statement");
    if (statement === undefined) {
      throw new CliError('Provide a SQL statement, e.g. altertable query "SELECT 1".');
    }
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, rawArgs);
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const httpOptions = readTimeoutMs !== undefined ? { readTimeoutMs } : undefined;
    const queryId = optionalStringArg(args, "query-id");
    const sessionId = optionalStringArg(args, "session-id");
    return { statement, format, displayOptions, pagerOptions, httpOptions, queryId, sessionId };
  },
  run: planQueryRun,
  present: presentQueryRun,
});

const queryShowCommand = defineHttpCommand({
  id: "lakehouse.query.show",
  plane: "lakehouse",
  operation: lakehouseQueryShowOperation,
  output: "raw-api",
  meta: {
    name: "show",
    description: "Fetch metadata for a completed or running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id returned by the API", required: true },
  },
  parse({ args }) {
    return stringArg(args, "query-id");
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const queryCancelCommand = defineHttpCommand({
  id: "lakehouse.query.cancel",
  plane: "lakehouse",
  operation: lakehouseQueryCancelOperation,
  mutates: true,
  output: "raw-api",
  meta: {
    name: "cancel",
    description: "Cancel a running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id to cancel", required: true },
    "session-id": { type: "string", description: "Session id that owns the query", required: true },
  },
  parse({ args }) {
    return {
      queryId: stringArg(args, "query-id"),
      sessionId: stringArg(args, "session-id"),
    };
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const querySubCommands = {
  run: queryRunCommand,
  show: queryShowCommand,
  cancel: queryCancelCommand,
} satisfies Record<string, CommandDef>;

const QUERY_SUBCOMMAND_NAMES = new Set(Object.keys(querySubCommands));

export const queryCommand = defineGroupCommand({
  meta: {
    name: "query",
    commandGroup: "query",
    description: "Run SQL queries against the lakehouse.",
    examples: [
      'altertable query "SELECT * FROM users LIMIT 10"',
      'altertable query "SELECT 1" --format json',
      "altertable query show <query-id>",
    ],
  },
  default: "run",
  args: queryGroupArgs,
  subCommands: querySubCommands,
});
