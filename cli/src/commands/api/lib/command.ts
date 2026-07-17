import { extractFieldArgs, extractRawFieldArgs } from "@/commands/api/lib/body.ts";
import { executeApiHttp, apiHttpResultOutput, resolveApiHttp } from "@/commands/api/lib/http.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { defineArgs, defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { valueFlagsFor } from "@/lib/command-delegation.ts";
import { readArgvFlagValue } from "@/lib/timeout-args.ts";

export const HTTP_METHOD_NAMES = ["GET", "POST", "PATCH", "DELETE", "PUT"] as const;

export const API_HTTP_BASE_ARGS = defineArgs({
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
});

export const API_VALUE_FLAGS = valueFlagsFor(API_HTTP_BASE_ARGS);
export const API_HTTP_ARGS = defineArgs({
  format: {
    type: "enum",
    description: "Output format: json, table, csv, or markdown",
    options: ["json", "table", "csv", "markdown"],
  },
  ...API_HTTP_BASE_ARGS,
});

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
