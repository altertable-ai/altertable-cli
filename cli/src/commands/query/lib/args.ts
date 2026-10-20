import { defineArguments } from '@/lib/command.ts';
import {
  queryApiResultFormatArgs,
  queryDisplayArgs,
  queryPagerArgs,
  queryRequestArgs,
} from '@/lib/query-output-args.ts';

export const queryRunArgs = defineArguments({
  statement: {
    type: 'positional',
    description: 'SQL statement to run',
    required: false,
  },
  file: {
    type: 'string',
    description: 'Path to a file containing the SQL statement; use - for stdin',
    completion: 'file',
  },
  ...queryApiResultFormatArgs,
  ...queryDisplayArgs,
  ...queryRequestArgs,
  'query-id': { type: 'string', description: 'Optional stable query id' },
  'session-id': { type: 'string', description: 'Optional session id' },
  ...queryPagerArgs,
});
