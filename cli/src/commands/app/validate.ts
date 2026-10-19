import {
  buildDataAppHttpRequest,
  formatValidationSummary,
  readRequiredFile,
  validationExitCode,
  type ValidateDataAppResponse,
} from '@/commands/app/lib/remote.ts';
import { stringArg } from '@/lib/args.ts';
import { requireManagementPlane } from '@/lib/auth.ts';
import { writeCommandOutput } from '@/lib/command-output.ts';
import { defineCommand } from '@/lib/command.ts';
import { sendHttp } from '@/lib/http-request.ts';
import { parseApiJson } from '@/lib/parse-api-json.ts';

export const appValidateCommand = defineCommand({
  metadata: {
    name: 'validate',
    description: 'Type-check and bundle a data app from source without saving.',
    examples: ['altertable app validate --file index.tsx'],
  },
  args: {
    file: {
      type: 'string',
      description:
        'Path to the single-file React source (index.tsx). Queries are declared in the file via defineDataApp.',
      required: true,
      completion: 'file',
    },
  },
  async run({ args, execution, sink }) {
    const env = requireManagementPlane(execution.profile, {
      requirement: 'Validating a data app requires the management API',
    });
    const indexTsx = await readRequiredFile(stringArg(args, 'file'), 'source');
    const response = parseApiJson(
      await sendHttp(
        buildDataAppHttpRequest(env, 'POST', '/data_apps/validate', {
          index_tsx: indexTsx,
        }),
        execution
      )
    ) as ValidateDataAppResponse;
    await writeCommandOutput(
      {
        kind: 'normalized',
        data: response,
        humanText: formatValidationSummary(response),
      },
      sink
    );
    return { exitCode: validationExitCode(response) };
  },
});
