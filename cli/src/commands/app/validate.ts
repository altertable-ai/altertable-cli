import { stringArg } from "@/lib/args.ts";
import { requireManagementPlane } from "@/lib/auth.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import {
  buildDataAppHttpRequest,
  formatValidationSummary,
  readQueriesFile,
  readRequiredFile,
  validationExitCode,
  type ValidateDataAppResponse,
} from "@/commands/app/lib/remote.ts";

export const appValidateCommand = defineCommand({
  metadata: {
    name: "validate",
    description: "Type-check and bundle a data app from files without saving.",
    examples: ["altertable app validate --file index.tsx --queries queries.json"],
  },
  args: {
    file: {
      type: "string",
      description: "Path to the single-file React source (index.tsx).",
      required: true,
      completion: "file",
    },
    queries: {
      type: "string",
      description: "Path to queries JSON (object of id → SQL, or [{id, sql}]).",
      required: true,
      completion: "file",
    },
  },
  async run({ args, execution, sink }) {
    const env = requireManagementPlane(execution.profile, {
      requirement: "Validating a data app requires the management API",
    });
    const indexTsx = await readRequiredFile(stringArg(args, "file"), "source");
    const queries = await readQueriesFile(stringArg(args, "queries"));
    const response = parseApiJson(
      await sendHttp(
        buildDataAppHttpRequest(env, "POST", "/data_apps/validate", {
          index_tsx: indexTsx,
          queries,
        }),
        execution,
      ),
    ) as ValidateDataAppResponse;
    await writeCommandOutput(
      {
        kind: "normalized",
        data: response,
        humanText: formatValidationSummary(response),
      },
      sink,
    );
    return { exitCode: validationExitCode(response) };
  },
});
