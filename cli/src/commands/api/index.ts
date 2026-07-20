import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { executeApiHttp, apiHttpResultOutput } from "@/commands/api/lib/http.ts";
import { API_HTTP_BASE_ARGS, resolveApiCommandRequest } from "@/commands/api/lib/command.ts";
import { apiSpecCommand } from "@/commands/api/spec.ts";
import { apiRoutesCommand } from "@/commands/api/routes.ts";

export const apiCommand = defineCommand({
  metadata: {
    name: "api",
    commandGroup: "platform",
    description: "Management REST API — HTTP invoker and OpenAPI spec.",
    examples: [
      "altertable api /whoami",
      "altertable api routes",
      "altertable api /environments/production/connections",
      'altertable api /service_accounts -X POST -F label="CI Bot"',
    ],
  },
  args: API_HTTP_BASE_ARGS,
  subcommands: {
    routes: apiRoutesCommand,
    spec: apiSpecCommand,
  },
  async run({ args, execution, sink }) {
    const result = await executeApiHttp(resolveApiCommandRequest(args), execution);
    const output = apiHttpResultOutput(result, sink);
    if (output) await writeCommandOutput(output, sink);
  },
});
