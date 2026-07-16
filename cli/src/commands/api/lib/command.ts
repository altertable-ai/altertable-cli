import type { ArgsDef } from "citty";
import { extractFieldArgs, extractRawFieldArgs } from "@/lib/api-body.ts";
import { executeApiHttp, apiHttpResultOutput, resolveApiHttp } from "@/lib/api-http.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { isDelegatedSubCommand, valueFlagsFor } from "@/lib/command-delegation.ts";
import { withManagementFormatArg } from "@/lib/management-output.ts";
import { readArgvFlagValue } from "@/lib/timeout-args.ts";

export const HTTP_METHOD_NAMES = ["GET", "POST", "PATCH", "DELETE", "PUT"] as const;
const API_COMMAND_NAMES = new Set<string>(["spec", "routes", ...HTTP_METHOD_NAMES]);

export const API_HTTP_BASE_ARGS = {
  method: {
    type: "enum",
    alias: "X",
    description: "HTTP method override (default GET, or POST when fields/body are provided)",
    options: [...HTTP_METHOD_NAMES],
  },
  endpoint: {
    type: "positional",
    description: "Path under /rest/v1, e.g. /whoami",
    required: false,
  },
  "raw-field": {
    type: "string",
    alias: "f",
    description: "String request parameter key=value (repeatable; gh api -f semantics)",
  },
  field: {
    type: "string",
    alias: "F",
    description: "Typed request parameter key=value (true, false, null, integers; repeatable)",
  },
  body: { type: "string", description: "JSON body or @file" },
  input: { type: "string", description: "Alias for --body (file path or - for stdin)" },
  env: { type: "string", description: "Replace {environment_id} in the path" },
} satisfies ArgsDef;

export const API_VALUE_FLAGS = valueFlagsFor(API_HTTP_BASE_ARGS);
export const API_HTTP_ARGS = withManagementFormatArg(API_HTTP_BASE_ARGS);

export function isApiCommandName(value: string): boolean {
  return API_COMMAND_NAMES.has(value) || API_COMMAND_NAMES.has(value.toUpperCase());
}

export function isDelegatedApiCommand(rawArgs: readonly string[]): boolean {
  return isDelegatedSubCommand(rawArgs, isApiCommandName, { valueFlags: API_VALUE_FLAGS });
}

export function resolveApiCommandRequest(
  args: Record<string, unknown>,
  rawArgs: string[],
  method?: string,
) {
  const rawFields = extractRawFieldArgs(rawArgs);
  const typedFields = extractFieldArgs(rawArgs);
  return resolveApiHttp({
    method: optionalStringArg(args, "method") ?? method,
    endpoint: optionalStringArg(args, "endpoint"),
    body: optionalStringArg(args, "body"),
    input: optionalStringArg(args, "input"),
    rawFields: rawFields.length > 0 ? rawFields : undefined,
    typedFields: typedFields.length > 0 ? typedFields : undefined,
    env: optionalStringArg(args, "env"),
    format: optionalStringArg(args, "format") ?? readArgvFlagValue(rawArgs, "--format"),
  });
}

const METHOD_EXAMPLES: Record<(typeof HTTP_METHOD_NAMES)[number], readonly string[]> = {
  GET: ["altertable api /whoami", "altertable api GET /environments/production/connections"],
  POST: [
    'altertable api POST /service_accounts -f label="CI Bot"',
    "altertable api POST /environments/production/databases -f name=Analytics",
  ],
  PATCH: [
    'altertable api PATCH /environments/production/connections/conn_1 --body \'{"name":"Renamed"}\'',
  ],
  DELETE: ["altertable api DELETE /service_accounts/sa_abc123"],
  PUT: ["altertable api PUT /path --body @payload.json"],
};

export function createApiMethodCommand(method: (typeof HTTP_METHOD_NAMES)[number]) {
  return defineCommand({
    meta: {
      name: method,
      description: `${method} request to the management REST API.`,
      examples: METHOD_EXAMPLES[method],
    },
    args: API_HTTP_ARGS,
    async run({ args, rawArgs, execution, sink }) {
      const result = await executeApiHttp(
        resolveApiCommandRequest(args, rawArgs, method),
        execution,
      );
      const output = apiHttpResultOutput(result, sink);
      if (output) await writeCommandOutput(output, sink);
    },
  });
}
