import { defineArguments } from '@/lib/command.ts';
import {
  queryApiResultFormatArgs,
  queryDisplayArgs,
  queryPagerArgs,
} from '@/lib/query-output-args.ts';

export const queryRunArgs = defineArguments({
  statement: {
    type: 'positional',
    description: 'SQL statement to run, or @file (@- for stdin)',
    required: false,
    directRequired: true,
  },
  ...queryApiResultFormatArgs,
  ...queryDisplayArgs,
  'compute-size': {
    type: 'string',
    description: 'Compute size for the query',
    default: 'AUTO',
  },
  dialect: {
    type: 'string',
    description:
      'Source SQL dialect to transpile from (server default: DuckDB)',
  },
  catalog: {
    type: 'string',
    description: 'Catalog name (optional; can also come from the session)',
  },
  schema: {
    type: 'string',
    description: 'Schema name (optional; can also come from the session)',
  },
  output: {
    type: 'string',
    description: 'Write result bytes/text to this path instead of stdout',
  },
  'query-id': { type: 'string', description: 'Optional stable query id' },
  'session-id': { type: 'string', description: 'Optional session id' },
  ...queryPagerArgs,
});
