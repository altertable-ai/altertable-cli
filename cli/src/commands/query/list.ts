import { writeCommandOutput } from '@/lib/command-output.ts';
import { defineCommand } from '@/lib/command.ts';
import { sendHttp } from '@/lib/http-request.ts';
import { buildLakehouseQueryListRequest } from '@/lib/lakehouse/query.ts';
import { extractManagementRows } from '@/lib/management-output.ts';
import { parseApiJson } from '@/lib/parse-api-json.ts';

export const queryListCommand = defineCommand({
  metadata: {
    name: 'list',
    description: 'List running queries in the current environment.',
  },
  async run({ execution, sink }) {
    const response = await sendHttp(
      buildLakehouseQueryListRequest(),
      execution
    );
    if (
      !sink.json &&
      extractManagementRows(parseApiJson(response)).length === 0
    ) {
      await writeCommandOutput(
        { kind: 'human', text: 'No running queries.' },
        sink
      );
      return;
    }
    await writeCommandOutput({ kind: 'tabular', body: response }, sink);
  },
});
