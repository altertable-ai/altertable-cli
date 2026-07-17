import type { CommandArgs } from "@/lib/command.ts";
import { normalizeDirectCommandRawArgs, valueFlagsFor } from "@/lib/command-delegation.ts";
import { defineCommand } from "@/lib/command.ts";
import { queryRunArgs } from "@/commands/query/lib/args.ts";
import { queryShowCommand } from "@/commands/query/show.ts";
import { queryCancelCommand } from "@/commands/query/cancel.ts";
import { CliError } from "@/lib/errors.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { writeQueryOutput } from "@/lib/query-output.ts";
import { parseQueryOutputOptions } from "@/lib/query-output-args.ts";
import { executeLakehouseQuery } from "@/lib/lakehouse/query.ts";

export const queryCommand = defineCommand({
  meta: {
    name: "query",
    commandGroup: "query",
    description: "Run SQL queries against the lakehouse.",
    examples: [
      'altertable query "SELECT * FROM users LIMIT 10"',
      'altertable query "SELECT 1" --json',
      "altertable query show <query-id>",
    ],
  },
  args: queryRunArgs,
  subCommands: {
    show: queryShowCommand,
    cancel: queryCancelCommand,
  },
  async run({ args, rawArgs, execution, sink }) {
    if (querySubcommandInvoked(rawArgs)) return;
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

const QUERY_SUBCOMMAND_NAMES = new Set([...Object.keys(queryCommand.subCommands ?? {}), "run"]);
const QUERY_VALUE_FLAGS = valueFlagsFor(queryRunArgs);

export function normalizeQueryInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: CommandArgs = {},
): string[] {
  return normalizeDirectCommandRawArgs(rawArgs, {
    commandName: "query",
    rootArgs,
    commandValueFlags: QUERY_VALUE_FLAGS,
    isReservedOperand: (value) => QUERY_SUBCOMMAND_NAMES.has(value),
  });
}

function querySubcommandInvoked(rawArgs: readonly string[]): boolean {
  return rawArgs.some((argument) => argument === "show" || argument === "cancel");
}
