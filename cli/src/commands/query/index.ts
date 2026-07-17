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
  metadata: {
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
  soleDirectOperands: ["show"],
  subcommands: {
    show: queryShowCommand,
    cancel: queryCancelCommand,
  },
  async run({ args, rawArgs, execution, sink }) {
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
