import { readFileSync } from 'node:fs';

import { queryCancelCommand } from '@/commands/query/cancel.ts';
import { queryRunArgs } from '@/commands/query/lib/args.ts';
import { queryShowCommand } from '@/commands/query/show.ts';
import { optionalStringArg, type ParsedArgsRecord } from '@/lib/args.ts';
import { defineCommand } from '@/lib/command.ts';
import { CliError } from '@/lib/errors.ts';
import {
  executeLakehouseQuery,
  executeLakehouseQueryBytes,
  type LakehouseQueryInput,
} from '@/lib/lakehouse/query.ts';
import { writeQueryDestination } from '@/lib/query-destination.ts';
import { parseQueryOutputOptions } from '@/lib/query-output-args.ts';
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
      'altertable query --file report.sql --format csv --output results.csv',
      'altertable query show <query-id>',
    ],
  },
  args: queryRunArgs,
  subcommands: {
    show: queryShowCommand,
    cancel: queryCancelCommand,
  },
  async run({ args, rawArgs, execution, sink }) {
    const statement = resolveStatement(args);
    const {
      format,
      displayOptions,
      pagerOptions,
      outputPath,
      computeSize,
      dialect,
      catalog,
      schema,
    } = parseQueryOutputOptions(args, {
      agent: execution.cli.agent,
      json: sink.json,
      rawArgs,
    });

    const input: LakehouseQueryInput = {
      statement,
      queryId: optionalStringArg(args, 'query-id'),
      sessionId: optionalStringArg(args, 'session-id'),
      computeSize,
      dialect,
      catalog,
      schema,
    };

    if (isApiNativeQueryFormat(format)) {
      const stream = await executeLakehouseQueryBytes(
        { ...input, format },
        execution
      );
      await writeQueryDestination(stream, { outputPath, sink });
      return;
    }

    const result = await executeLakehouseQuery(input, execution, !sink.json);
    await writeQueryOutput(
      result,
      format,
      sink,
      displayOptions,
      pagerOptions,
      outputPath
    );
  },
});

function resolveStatement(args: ParsedArgsRecord): string {
  const statement = optionalStringArg(args, 'statement');
  const filePath = optionalStringArg(args, 'file');
  if (statement !== undefined && filePath !== undefined) {
    throw new CliError('Provide either a SQL statement or --file, not both.');
  }
  if (statement !== undefined) {
    return statement;
  }
  if (filePath === undefined) {
    throw new CliError(
      'Provide a SQL statement, e.g. altertable query "SELECT 1" or altertable query --file report.sql.'
    );
  }

  const contents = readSqlFile(filePath);
  if (contents.trim() === '') {
    throw new CliError(
      filePath === '-'
        ? 'SQL from stdin is empty.'
        : `SQL file is empty: ${filePath}`
    );
  }
  return contents;
}

function readSqlFile(filePath: string): string {
  if (filePath === '-') {
    return readFileSync(0, 'utf8');
  }
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    throw new CliError(`File not found: ${filePath}`);
  }
}
