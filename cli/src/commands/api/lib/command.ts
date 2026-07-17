import { resolveApiHttp } from "@/commands/api/lib/http.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { defineArguments } from "@/lib/command.ts";

export const API_HTTP_BASE_ARGS = defineArguments({
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
    directRequired: true,
  },
  "raw-field": {
    type: "string",
    alias: "f",
    repeatable: true,
    description: "String request parameter key=value (repeatable; gh api -f semantics)",
  },
  field: {
    type: "string",
    alias: "F",
    repeatable: true,
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

export function resolveApiCommandRequest(args: Record<string, unknown>, method?: string) {
  const rawFields = repeatableStringArg(args["raw-field"]);
  const typedFields = repeatableStringArg(args.field);
  return resolveApiHttp({
    method: optionalStringArg(args, "method") ?? method,
    endpoint: optionalStringArg(args, "endpoint"),
    input: optionalStringArg(args, "input"),
    rawFields,
    typedFields,
    env: optionalStringArg(args, "env"),
    format: optionalStringArg(args, "format"),
  });
}

function repeatableStringArg(value: unknown): string | string[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value;
  }
  return undefined;
}
