import { CliError } from "@/lib/errors.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { writeQueryOutput } from "@/lib/lakehouse-client.ts";
import {
  parseQueryOutputOptions,
  parseRequestReadTimeoutMs,
  queryRunArgs,
} from "@/lib/lakehouse/args.ts";
import { executeLakehouseQuery } from "@/lib/lakehouse/query.ts";

export const queryRunCommand = defineCommand({
  meta: {
    name: "run",
    description: "Run a SQL statement.",
    examples: [
      'altertable query "SELECT * FROM users LIMIT 10"',
      'altertable query "SELECT 1" --format json',
    ],
  },
  args: queryRunArgs,
  async run({ args, rawArgs, execution, sink }) {
    const statement = optionalStringArg(args, "statement");
    if (statement === undefined) {
      throw new CliError('Provide a SQL statement, e.g. altertable query "SELECT 1".');
    }
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, rawArgs);
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const input = {
      statement,
      queryId: optionalStringArg(args, "query-id"),
      sessionId: optionalStringArg(args, "session-id"),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
    const result = await executeLakehouseQuery(input, execution, format !== "json" && !sink.json);
    await writeQueryOutput(result, format, displayOptions, pagerOptions, sink);
  },
});
