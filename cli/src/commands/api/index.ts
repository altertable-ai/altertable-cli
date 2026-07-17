import type { CommandArgs } from "@/lib/command.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { executeApiHttp, apiHttpResultOutput } from "@/commands/api/lib/http.ts";
import { API_HTTP_BASE_ARGS, resolveApiCommandRequest } from "@/commands/api/lib/command.ts";
import {
  isDelegatedSubCommand,
  normalizePassthroughCommandRawArgs,
} from "@/lib/command-delegation.ts";
import { API_VALUE_FLAGS } from "@/commands/api/lib/command.ts";
import { apiSpecCommand } from "@/commands/api/spec.ts";
import { apiRoutesCommand } from "@/commands/api/routes.ts";

export const apiCommand = defineCommand({
  meta: {
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
  subCommands: {
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

const API_SUBCOMMAND_NAMES = new Set(Object.keys(apiCommand.subCommands ?? {}));

export function normalizeApiInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: CommandArgs = {},
): string[] {
  return normalizePassthroughCommandRawArgs(rawArgs, {
    commandName: "api",
    rootArgs,
    commandValueFlags: API_VALUE_FLAGS,
    isReservedOperand: isApiCommandName,
  });
}

function isApiCommandName(value: string): boolean {
  return API_SUBCOMMAND_NAMES.has(value);
}

function isDelegatedApiCommand(rawArgs: readonly string[]): boolean {
  return isDelegatedSubCommand(rawArgs, isApiCommandName, { valueFlags: API_VALUE_FLAGS });
}
