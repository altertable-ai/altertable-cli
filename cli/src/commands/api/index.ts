import type { ArgsDef } from "citty";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { executeApiHttp, apiHttpResultOutput } from "@/commands/api/lib/http.ts";
import {
  API_HTTP_BASE_ARGS,
  isDelegatedApiCommand,
  isApiCommandName,
  resolveApiCommandRequest,
} from "@/commands/api/lib/command.ts";
import { normalizePassthroughCommandRawArgs } from "@/lib/command-delegation.ts";
import { API_VALUE_FLAGS } from "@/commands/api/lib/command.ts";
import { apiGetCommand } from "@/commands/api/get.ts";
import { apiPostCommand } from "@/commands/api/post.ts";
import { apiPatchCommand } from "@/commands/api/patch.ts";
import { apiDeleteCommand } from "@/commands/api/delete.ts";
import { apiPutCommand } from "@/commands/api/put.ts";
import { apiSpecCommand } from "@/commands/api/spec.ts";
import { apiRoutesCommand } from "@/commands/api/routes.ts";

export { runApiSpecCommand } from "@/commands/api/spec.ts";
export { runApiRoutesCommand } from "@/commands/api/routes.ts";

export function normalizeApiInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: ArgsDef = {},
): string[] {
  return normalizePassthroughCommandRawArgs(rawArgs, {
    commandName: "api",
    rootArgs,
    commandValueFlags: API_VALUE_FLAGS,
    isReservedOperand: isApiCommandName,
  });
}

export const apiCommand = defineCommand({
  meta: {
    name: "api",
    commandGroup: "platform",
    description: "Management REST API — HTTP invoker and OpenAPI spec.",
    examples: [
      "altertable api /whoami",
      "altertable api routes",
      "altertable api GET /environments/production/connections",
      'altertable api POST /service_accounts -f label="CI Bot"',
    ],
  },
  args: API_HTTP_BASE_ARGS,
  subCommands: {
    DELETE: apiDeleteCommand,
    GET: apiGetCommand,
    PATCH: apiPatchCommand,
    POST: apiPostCommand,
    PUT: apiPutCommand,
    routes: apiRoutesCommand,
    spec: apiSpecCommand,
  },
  async run({ args, rawArgs, execution, sink }) {
    if (isDelegatedApiCommand(rawArgs)) return;
    const result = await executeApiHttp(resolveApiCommandRequest(args, rawArgs), execution);
    const output = apiHttpResultOutput(result, sink);
    if (output) await writeCommandOutput(output, sink);
  },
});
