import { extractFieldArgs, extractRawFieldArgs } from "@/commands/api/lib/body.ts";
import { resolveApiHttp } from "@/commands/api/lib/http.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { defineArgs } from "@/lib/command.ts";
import { valueFlagsFor } from "@/lib/command-delegation.ts";
import { readArgvFlagValue } from "@/lib/timeout-args.ts";

export const API_HTTP_BASE_ARGS = defineArgs({
  method: {
    type: "enum",
    alias: "X",
    description: "HTTP method override (default GET, or POST when fields/input are provided)",
    options: ["GET", "POST", "PATCH", "DELETE", "PUT"],
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
  input: { type: "string", description: "File to use as the request body; use - for stdin" },
  env: { type: "string", description: "Replace {environment_id} in the path" },
  format: {
    type: "enum",
    description: "Serialized output format; use global --json for JSON",
    options: ["csv", "markdown"],
  },
});

export const API_VALUE_FLAGS = valueFlagsFor(API_HTTP_BASE_ARGS);

export function resolveApiCommandRequest(
  args: Record<string, unknown>,
  rawArgs: string[],
  method?: string,
) {
  const rawFields = extractRawFieldArgs(rawArgs);
  const typedFields = extractFieldArgs(rawArgs);
  return resolveApiHttp({
    method:
      optionalStringArg(args, "method") ??
      readArgvFlagValue(rawArgs, "--method") ??
      readArgvFlagValue(rawArgs, "-X") ??
      method,
    endpoint: optionalStringArg(args, "endpoint"),
    input: optionalStringArg(args, "input") ?? readArgvFlagValue(rawArgs, "--input"),
    rawFields: rawFields.length > 0 ? rawFields : undefined,
    typedFields: typedFields.length > 0 ? typedFields : undefined,
    env: optionalStringArg(args, "env") ?? readArgvFlagValue(rawArgs, "--env"),
    format: optionalStringArg(args, "format") ?? readArgvFlagValue(rawArgs, "--format"),
  });
}
