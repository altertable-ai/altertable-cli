import type { ArgsDef } from "citty";
import { normalizeDefaultSubCommandRawArgs, valueFlagsFor } from "@/lib/command-delegation.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { queryRunArgs } from "@/lib/lakehouse/args.ts";
import { queryRunCommand } from "@/commands/query/run.ts";
import { queryShowCommand } from "@/commands/query/show.ts";
import { queryCancelCommand } from "@/commands/query/cancel.ts";

const QUERY_SUBCOMMAND_NAMES = new Set(["run", "show", "cancel"]);
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

export const queryCommand = defineCommand({
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
  args: queryRunArgs,
  subCommands: {
    run: queryRunCommand,
    show: queryShowCommand,
    cancel: queryCancelCommand,
  },
});
