import type { ArgsDef } from "citty";
import {
  getOpenapiSpecJson,
  getOpenapiSpecYaml,
  resolveOpenapiSpecFormat,
} from "@/lib/openapi-spec.ts";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { apiHttpOperationPlan, apiHttpResultOutput } from "@/lib/api-http.ts";
import { extractFieldArgs, extractRawFieldArgs } from "@/lib/api-body.ts";
import { CliError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import {
  findFirstPositionalToken,
  isDelegatedSubCommand,
  valueFlagsFor,
} from "@/lib/command-delegation.ts";
import { operationPlan, outputEffect, valueEffect } from "@/lib/operation-effect.ts";
import { withManagementFormatArg } from "@/lib/management-output.ts";
import { readArgvFlagValue } from "@/lib/timeout-args.ts";
import { renderApiRoutesTableSection } from "@/lib/table-format.ts";
import {
  formatTerminalLabelValue,
  formatTerminalSection,
  terminalAccent,
} from "@/lib/terminal-style.ts";

const HTTP_METHOD_NAMES = ["GET", "POST", "PATCH", "DELETE", "PUT"] as const;
const PATH_PARAMETER_PATTERN = /\{([^}]+)\}/g;
const API_META_COMMAND_NAMES = new Set(["spec", "routes"]);
const HTTP_METHOD_NAME_SET = new Set<string>(HTTP_METHOD_NAMES);

const API_HTTP_BASE_ARGS = {
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

const API_VALUE_FLAGS = valueFlagsFor(API_HTTP_BASE_ARGS);
const API_HTTP_ARGS = withManagementFormatArg(API_HTTP_BASE_ARGS);

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isHttpMethodName(value: string): boolean {
  return HTTP_METHOD_NAME_SET.has(value.toUpperCase());
}

function isApiCommandName(value: string): boolean {
  return API_META_COMMAND_NAMES.has(value) || isHttpMethodName(value);
}

function isDelegatedApiCommand(rawArgs: readonly string[]): boolean {
  return isDelegatedSubCommand(rawArgs, API_META_COMMAND_NAMES, {
    valueFlags: API_VALUE_FLAGS,
  });
}

/** Citty treats endpoint paths as subcommand names unless we separate them with `--`. */
export function normalizeApiInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: ArgsDef = {},
): string[] {
  const apiToken = findFirstPositionalToken(rawArgs, { valueFlags: valueFlagsFor(rootArgs) });
  if (!apiToken || apiToken.value !== "api") {
    return [...rawArgs];
  }

  const afterApi = rawArgs.slice(apiToken.index + 1);
  if (afterApi.includes("--")) {
    return [...rawArgs];
  }

  const endpointToken = findFirstPositionalToken(afterApi, { valueFlags: API_VALUE_FLAGS });
  if (!endpointToken || isApiCommandName(endpointToken.value)) {
    return [...rawArgs];
  }

  const normalized = [...rawArgs];
  normalized.splice(apiToken.index + 1 + endpointToken.index, 0, "--");
  return normalized;
}

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
    format: stringArg(args.format) ?? readArgvFlagValue(rawArgs, "--format"),
  };
}

const HTTP_METHOD_EXAMPLES: Record<(typeof HTTP_METHOD_NAMES)[number], readonly string[]> = {
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

function createApiMethodCommand(method: string) {
  const methodExamples = HTTP_METHOD_EXAMPLES[method as (typeof HTTP_METHOD_NAMES)[number]];

  return defineOperationCommand({
    id: `api.${method.toLowerCase()}`,
    capabilities: ["management-http"],
    catalog: {
      effects: ["http"],
      planes: ["management"],
      mutates: method !== "GET",
      output: "tabular",
    },
    meta: {
      name: method,
      description: `${method} request to the management REST API.`,
      examples: methodExamples,
    },
    args: API_HTTP_ARGS,
    parse({ args, rawArgs }) {
      return buildApiHttpArgs(args, rawArgs, method);
    },
    run(input, context) {
      return apiHttpOperationPlan(input, context);
    },
    present(result, { sink }) {
      return apiHttpResultOutput(result, sink);
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

  const detailLines = [
    formatTerminalLabelValue("Operation:", terminalAccent(operation.operationId), {
      labelWidth: 12,
    }),
    formatTerminalLabelValue("Method:", operation.method, { labelWidth: 12 }),
    formatTerminalLabelValue("Path:", operation.path, { labelWidth: 12 }),
    formatTerminalLabelValue("Parameters:", parameterText, { labelWidth: 12 }),
    formatTerminalLabelValue("Summary:", operation.summary, { labelWidth: 12 }),
  ];

  return formatTerminalSection(detailLines);
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

function apiSpecOutput(sink: OutputSink, options?: { format?: string }) {
  const format = resolveOpenapiSpecFormat(
    sink.json,
    process.stdout.isTTY === true,
    options?.format,
  );

  if (format === "json") {
    return { kind: "raw_api" as const, body: getOpenapiSpecJson() };
  }

  return { kind: "human" as const, text: getOpenapiSpecYaml() };
}

export function runApiSpecCommand(sink: OutputSink, options?: { format?: string }): void {
  writeCommandOutput(apiSpecOutput(sink, options), sink);
}

function apiRoutesOutput(operationId?: string) {
  if (operationId) {
    return {
      kind: "normalized" as const,
      data: operationDetailsJson(operationId),
      humanText: formatOperationDetails(operationId),
    };
  }

  const table = renderApiRoutesTableSection(
    OPENAPI_OPERATIONS.map((operation) => ({
      method: operation.method,
      path: operation.path,
      operationId: operation.operationId,
      summary: operation.summary,
    })),
  );
  return {
    kind: "normalized" as const,
    data: OPENAPI_OPERATIONS,
    humanText: table,
  };
}

export function runApiRoutesCommand(sink: OutputSink, operationId?: string): void {
  writeCommandOutput(apiRoutesOutput(operationId), sink);
}

const apiSpecCommand = defineOperationCommand({
  id: "api.spec",
  capabilities: ["raw-stdout"],
  catalog: { effects: ["output"], output: "raw-api" },
  meta: {
    name: "spec",
    description:
      "Print the bundled management OpenAPI specification (YAML in a terminal; JSON when piped or with --json).",
    examples: ["altertable api spec", "altertable api spec --json"],
  },
  args: {
    format: {
      type: "enum",
      options: ["json", "yaml"],
      description:
        "Output format (default: yaml in a terminal, json when piped or with global --json)",
    },
  },
  parse({ args }) {
    return { format: stringArg(args.format) };
  },
  run(input, { sink }) {
    return operationPlan(outputEffect(apiSpecOutput(sink, input)));
  },
});

const apiRoutesCommand = defineOperationCommand({
  id: "api.routes",
  capabilities: [],
  catalog: { effects: ["output"], output: "normalized" },
  meta: {
    name: "routes",
    description: "List management API paths and methods from the bundled OpenAPI spec.",
    examples: ["altertable api routes", "altertable api routes createDatabase"],
  },
  args: {
    operation: {
      type: "positional",
      description: "Optional operationId to inspect, e.g. createDatabase",
      required: false,
    },
  },
  parse({ args }) {
    return stringArg(args.operation);
  },
  run(operationId) {
    return operationPlan(outputEffect(apiRoutesOutput(operationId)));
  },
});

const apiMethodSubCommands = Object.fromEntries(
  HTTP_METHOD_NAMES.map((method) => [method, createApiMethodCommand(method)]),
);

export const apiCommand = defineOperationCommand({
  id: "api.invoke",
  capabilities: ["management-http"],
  catalog: {
    effects: ["http"],
    planes: ["management"],
    output: "tabular",
  },
  meta: {
    name: "api",
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
    spec: apiSpecCommand,
    routes: apiRoutesCommand,
    ...apiMethodSubCommands,
  },
  parse({ args, rawArgs }) {
    return {
      delegated: isDelegatedApiCommand(rawArgs),
      args: buildApiHttpArgs(args, rawArgs),
    };
  },
  run(input, context) {
    if (input.delegated) {
      return operationPlan(valueEffect(undefined));
    }
    return apiHttpOperationPlan(input.args, context);
  },
  present(result, { sink }) {
    if (result === undefined) {
      return;
    }
    return apiHttpResultOutput(result, sink);
  },
});
