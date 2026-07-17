import type { CommandArgs } from "@/lib/command.ts";
import {
  findFirstPositionalToken,
  normalizeDirectCommandRawArgs,
  resolveSelectedSubCommand,
  valueFlagsFor,
} from "@/lib/command-delegation.ts";
import { defineCommand } from "@/lib/command.ts";
import { queryRunArgs } from "@/commands/query/lib/args.ts";
import { queryShowCommand } from "@/commands/query/show.ts";
import { queryCancelCommand } from "@/commands/query/cancel.ts";
import { CliError } from "@/lib/errors.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { writeQueryOutput } from "@/lib/query-output.ts";
import { parseQueryOutputOptions } from "@/lib/query-output-args.ts";
import { executeLakehouseQuery } from "@/lib/lakehouse/query.ts";
import { HELP_FLAGS } from "@/lib/early-bootstrap.ts";

export const queryCommand = defineCommand({
  meta: {
    name: "query",
    commandGroup: "query",
    description: "Run SQL queries against the lakehouse.",
    examples: [
      'altertable query "SELECT id, email, plan FROM analytics.main.users LIMIT 10"',
      'altertable query "SELECT event, timestamp FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10" --json',
      "altertable query show <query-id>",
    ],
  },
  args: queryRunArgs,
  subCommands: {
    show: queryShowCommand,
    cancel: queryCancelCommand,
  },
  async run({ args, rawArgs, execution, sink }) {
    if (await resolveSelectedSubCommand(queryCommand, rawArgs)) return;
    const statement = optionalStringArg(args, "statement");
    if (statement === undefined) {
      throw new CliError('Provide a SQL statement, e.g. altertable query "SELECT 1".');
    }
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, {
      agent: execution.cli.agent,
      rawArgs,
    });
    const input = {
      statement,
      queryId: optionalStringArg(args, "query-id"),
      sessionId: optionalStringArg(args, "session-id"),
    };
    const result = await executeLakehouseQuery(input, execution, !sink.json);
    await writeQueryOutput(result, format, sink, displayOptions, pagerOptions);
  },
});

const QUERY_SUBCOMMAND_NAMES = new Set(Object.keys(queryCommand.subCommands ?? {}));
const QUERY_RESERVED_OPERANDS = new Set([...QUERY_SUBCOMMAND_NAMES, "run"]);
const QUERY_VALUE_FLAGS = valueFlagsFor(queryRunArgs);

export function normalizeQueryInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: CommandArgs = {},
): string[] {
  const bareShowIsSql = isBareShowStatement(rawArgs, rootArgs);
  return normalizeDirectCommandRawArgs(rawArgs, {
    commandName: "query",
    rootArgs,
    commandValueFlags: QUERY_VALUE_FLAGS,
    isReservedOperand: (value) => QUERY_RESERVED_OPERANDS.has(value) && !bareShowIsSql,
  });
}

function isBareShowStatement(rawArgs: readonly string[], rootArgs: CommandArgs): boolean {
  const commandToken = findFirstPositionalToken(rawArgs, {
    valueFlags: valueFlagsFor(rootArgs),
  });
  if (!commandToken || commandToken.value !== "query") return false;

  const queryArgs = rawArgs.slice(commandToken.index + 1);
  if (
    queryArgs.includes("--") ||
    queryArgs.some((argument) => HELP_FLAGS.some((flag) => flag === argument))
  ) {
    return false;
  }
  const statement = findFirstPositionalToken(queryArgs, { valueFlags: QUERY_VALUE_FLAGS });
  if (!statement || statement.value !== "show") return false;

  const subcommandOperand = findFirstPositionalToken(queryArgs.slice(statement.index + 1), {
    valueFlags: QUERY_VALUE_FLAGS,
  });
  return subcommandOperand === undefined;
}
