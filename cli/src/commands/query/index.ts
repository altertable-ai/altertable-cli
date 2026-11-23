import { queryCancelCommand } from '@/commands/query/cancel.ts';
import { queryRunArgs } from '@/commands/query/lib/args.ts';
import { parseQueryStatement } from '@/commands/query/lib/statement.ts';
import { queryListCommand } from '@/commands/query/list.ts';
import { queryShowCommand } from '@/commands/query/show.ts';
import { queryTopCommand } from '@/commands/query/top.ts';
import { optionalStringArg } from '@/lib/args.ts';
import { asCliArgString } from '@/lib/cli-args.ts';
import { defineCommand } from '@/lib/command.ts';
import { CliError } from '@/lib/errors.ts';
import {
  executeLakehouseQuery,
  executeLakehouseQueryBytes,
  type LakehouseQueryInput,
} from '@/lib/lakehouse/query.ts';
import { writeQueryDestination } from '@/lib/query-destination.ts';
import {
  parseQueryOutputOptions,
  validateApiNativeFormatFlags,
} from '@/lib/query-output-args.ts';
import {
  isApiNativeQueryFormat,
  writeQueryOutput,
} from '@/lib/query-output.ts';

export const queryCommand = defineCommand({
  metadata: {
    name: 'query',
    commandGroup: 'query',
    description: 'Run SQL queries against the lakehouse.',
    examples: [
      'altertable query "SELECT id, email, plan FROM analytics.main.users LIMIT 10"',
      'altertable query "SELECT event, timestamp FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10" --json',
      'altertable query "SELECT 1" --format csv --output results.csv',
      'altertable query @report.sql --format csv --output results.csv',
      'altertable query list',
      'altertable query show <query-id>',
      'altertable query top --watch',
    ],
  },
  args: queryRunArgs,
  subcommands: {
    list: queryListCommand,
    show: queryShowCommand,
    top: queryTopCommand,
    cancel: queryCancelCommand,
  },
  async run({ args, explicitOptions, execution, sink }) {
    const statementArg = optionalStringArg(args, 'statement');
    if (statementArg === undefined) {
      throw new CliError(
        'Provide a SQL statement, e.g. altertable query "SELECT 1".'
      );
    }
    const statement = parseQueryStatement(statementArg);
    const outputContext = {
      agent: execution.cli.agent,
      json: sink.json,
      explicitOptions,
    };
    const output = parseQueryOutputOptions(args, outputContext);
    const { format } = output;
    const outputPath = optionalStringArg(args, 'output');
    if (explicitOptions.has('output') && outputPath === undefined) {
      throw new CliError('--output requires a file path.');
    }
    const sessionId = optionalStringArg(args, 'session-id');
    const input: LakehouseQueryInput = {
      statement,
      queryId: optionalStringArg(args, 'query-id'),
      sessionId,
      computeSize:
        sessionId?.trim() && !explicitOptions.has('compute-size')
          ? undefined
          : asCliArgString(args['compute-size']),
      dialect: optionalStringArg(args, 'dialect')?.trim(),
      catalog: optionalStringArg(args, 'catalog')?.trim(),
      schema: optionalStringArg(args, 'schema')?.trim(),
    };

    if (isApiNativeQueryFormat(format)) {
      validateApiNativeFormatFlags(format, outputContext);
      const stream = await executeLakehouseQueryBytes(
        { ...input, format },
        execution
      );
      await writeQueryDestination(stream, { outputPath, sink });
      return;
    }

    const result = await executeLakehouseQuery(input, execution, !sink.json);
    await writeQueryOutput(result, sink, { ...output, outputPath });
  },
});
