import { upsertArgs } from '@/commands/upsert/lib/args.ts';
import { optionalStringArg, stringArg } from '@/lib/args.ts';
import { writeCommandOutput } from '@/lib/command-output.ts';
import { defineCommand } from '@/lib/command.ts';
import { sendHttp } from '@/lib/http-request.ts';
import { createLakehouseUpsertRequest } from '@/lib/lakehouse-transport.ts';
import {
  parseLakehouseFileContentType,
  parseLakehouseTarget,
} from '@/lib/lakehouse/args.ts';
import { getFileSizeBytes } from '@/lib/lakehouse/file.ts';

export const upsertCommand = defineCommand({
  metadata: {
    name: 'upsert',
    commandGroup: 'ingest',
    description: 'Upload a file and match existing rows by primary key.',
    examples: [
      'altertable upsert users.csv --to analytics.main.users --key id',
    ],
  },
  args: upsertArgs,
  async run({ args, execution, sink }) {
    const filePath = stringArg(args, 'file');
    const fileSizeBytes = getFileSizeBytes(filePath);
    const target = parseLakehouseTarget(stringArg(args, 'to'));

    const scope = createLakehouseUpsertRequest({
      ...target,
      primaryKey: stringArg(args, 'key'),
      filePath,
      fileSizeBytes,
      contentType: parseLakehouseFileContentType(
        optionalStringArg(args, 'format'),
        filePath
      ),
    });
    try {
      const response = await sendHttp(scope.request, execution);
      await writeCommandOutput({ kind: 'raw_api', body: response }, sink);
    } finally {
      scope.release();
    }
  },
});
