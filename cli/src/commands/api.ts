import type { ArgsDef } from "citty";
import { getOpenapiSpecJson, getOpenapiSpecYaml } from "@/lib/openapi-spec.ts";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { runApiHttp } from "@/lib/api-http.ts";
import { extractFieldArgs, extractRawFieldArgs } from "@/lib/api-body.ts";
import { CliError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { withManagementFormatArg } from "@/lib/management-output.ts";
import { renderFixedTable } from "@/lib/table-format.ts";

const HTTP_METHOD_NAMES = ["GET", "POST", "PATCH", "DELETE", "PUT"] as const;
const PATH_PARAMETER_PATTERN = /\{([^}]+)\}/g;
const API_DELEGATED_SUBCOMMAND_NAMES = new Set<string>([
  "spec",
  "routes",
  ...HTTP_METHOD_NAMES,
]);

function firstPositionalRawArg(rawArgs: readonly string[]): string | undefined {
  for (const arg of rawArgs) {
    if (arg === "--") {
      return undefined;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    return arg;
  }
  return undefined;
}

function isDelegatedApiSubCommand(rawArgs: readonly string[]): boolean {
  const subCommandName = firstPositionalRawArg(rawArgs);
  if (!subCommandName) {
    return false;
  }
  if (API_DELEGATED_SUBCOMMAND_NAMES.has(subCommandName)) {
    return true;
  }
  return API_DELEGATED_SUBCOMMAND_NAMES.has(subCommandName.toUpperCase());
}

const API_HTTP_ARGS = withManagementFormatArg({
  method: {
    type: "string",
    alias: "X",
    description: "HTTP method override (default GET, or POST when fields/body are provided)",
  },
  endpoint: {
    type: "positional",
    description: "Path under /rest/v1, e.g. /whoami",
    required: true,
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
} satisfies ArgsDef);

function buildApiHttpArgs(args: Record<string, unknown>, rawArgs: string[], method?: string) {
  const rawFieldArgs = extractRawFieldArgs(rawArgs);
  const fieldArgs = extractFieldArgs(rawArgs);

  return {
    method: stringArg(args.method) ?? method,
    endpoint: stringArg(args.endpoint),
    body: stringArg(args.body),
    input: stringArg(args.input),
    rawFields: rawFieldArgs.length > 0 ? rawFieldArgs : undefined,
    typedFields: fieldArgs.length > 0 ? fieldArgs : undefined,
    env: stringArg(args.env),
    format: stringArg(args.format),
  };
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function createApiMethodCommand(method: string) {
  return defineAltertableCommand({
    meta: {
      name: method,
      description: `${method} request to the management REST API.`,
    },
    args: API_HTTP_ARGS,
    async run({ args, rawArgs, sink }) {
      await runApiHttp(buildApiHttpArgs(args, rawArgs, method), sink);
    },
  });
}

function extractPathParameters(path: string): string[] {
  return [...path.matchAll(PATH_PARAMETER_PATTERN)].map((match) => String(match[1]));
}

function formatOperationDetails(operationId: string): string {
  const operation = OPENAPI_OPERATIONS.find((candidate) => candidate.operationId === operationId);
  if (!operation) {
    throw new CliError(`Unknown API operation: ${operationId}`);
  }

  const pathParameters = extractPathParameters(operation.path);
  const parameterText = pathParameters.length > 0 ? pathParameters.join(", ") : "(none)";

  return [
    `Operation: ${operation.operationId}`,
    `Method: ${operation.method}`,
    `Path: ${operation.path}`,
    `Parameters: ${parameterText}`,
    `Summary: ${operation.summary}`,
  ].join("\n");
}

function operationDetailsJson(operationId: string): Record<string, unknown> {
  const operation = OPENAPI_OPERATIONS.find((candidate) => candidate.operationId === operationId);
  if (!operation) {
    throw new CliError(`Unknown API operation: ${operationId}`);
  }

  return {
    ...operation,
    parameters: extractPathParameters(operation.path),
  };
}

export function runApiSpecCommand(sink: OutputSink): void {
  if (sink.json) {
    sink.writeRaw(getOpenapiSpecJson());
  } else {
    sink.writeHuman(getOpenapiSpecYaml());
  }
}

export function runApiRoutesCommand(sink: OutputSink, operationId?: string): void {
  if (operationId) {
    if (sink.json) {
      sink.writeJson(operationDetailsJson(operationId));
    } else {
      sink.writeHuman(formatOperationDetails(operationId));
    }
    return;
  }

  if (sink.json) {
    sink.writeJson(OPENAPI_OPERATIONS);
    return;
  }

  const table = renderFixedTable(
    OPENAPI_OPERATIONS,
    [
      { header: "METHOD", cell: (operation) => operation.method },
      { header: "PATH", cell: (operation) => operation.path },
      { header: "OPERATION", cell: (operation) => operation.operationId },
      { header: "SUMMARY", cell: (operation) => operation.summary },
    ],
    "No operations found.",
  );
  sink.writeHuman(table);
}

const apiSpecCommand = defineAltertableCommand({
  meta: {
    name: "spec",
    description: "Print the bundled management OpenAPI specification.",
  },
  run({ sink }) {
    runApiSpecCommand(sink);
  },
});

const apiRoutesCommand = defineAltertableCommand({
  meta: {
    name: "routes",
    description: "List management API paths and methods from the bundled OpenAPI spec.",
  },
  args: {
    operation: {
      type: "positional",
      description: "Optional operationId to inspect, e.g. createDatabase",
      required: false,
    },
  },
  run({ args, sink }) {
    const operationId = args.operation ? String(args.operation) : undefined;
    runApiRoutesCommand(sink, operationId);
  },
});

const apiMethodSubCommands = Object.fromEntries(
  HTTP_METHOD_NAMES.map((method) => [method, createApiMethodCommand(method)]),
);

export const apiCommand = defineAltertableCommand({
  meta: {
    name: "api",
    description: "Management REST API — HTTP invoker and OpenAPI spec.",
  },
  args: API_HTTP_ARGS,
  subCommands: {
    spec: apiSpecCommand,
    routes: apiRoutesCommand,
    ...apiMethodSubCommands,
  },
  async run({ args, rawArgs, sink }) {
    if (isDelegatedApiSubCommand(rawArgs)) {
      return;
    }
    await runApiHttp(buildApiHttpArgs(args, rawArgs), sink);
  },
});
