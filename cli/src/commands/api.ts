import type { ArgsDef } from "citty";
import {
  getOpenapiSpecJson,
  getOpenapiSpecYaml,
  resolveOpenapiSpecFormat,
} from "@/lib/openapi-spec.ts";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import {
  API_HTTP_OPERATION,
  apiHttpResultOutput,
  resolveApiHttp,
  type ApiHttpResult,
  type ResolvedApiHttp,
} from "@/lib/api-http.ts";
import { extractFieldArgs, extractRawFieldArgs } from "@/lib/api-body.ts";
import { CliError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { defineHttpCommand, defineOutputCommand } from "@/lib/operation-command-builders.ts";
import { optionalStringArg } from "@/lib/operation-codec.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import {
  isDelegatedSubCommand,
  normalizePassthroughCommandRawArgs,
  valueFlagsFor,
} from "@/lib/command-delegation.ts";
import { noopPlan } from "@/lib/operation-effect.ts";
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
const API_COMMAND_NAMES = new Set<string>(["spec", "routes", ...HTTP_METHOD_NAMES]);

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

function isApiCommandName(value: string): boolean {
  return API_COMMAND_NAMES.has(value) || API_COMMAND_NAMES.has(value.toUpperCase());
}

function isDelegatedApiCommand(rawArgs: readonly string[]): boolean {
  return isDelegatedSubCommand(rawArgs, isApiCommandName, {
    valueFlags: API_VALUE_FLAGS,
  });
}

/** Citty treats endpoint paths as subcommand names unless we separate them with `--`. */
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

function buildApiHttpArgs(args: Record<string, unknown>, rawArgs: string[], method?: string) {
  const rawFieldArgs = extractRawFieldArgs(rawArgs);
  const fieldArgs = extractFieldArgs(rawArgs);

  return {
    method: optionalStringArg(args, "method") ?? method,
    endpoint: optionalStringArg(args, "endpoint"),
    body: optionalStringArg(args, "body"),
    input: optionalStringArg(args, "input"),
    rawFields: rawFieldArgs.length > 0 ? rawFieldArgs : undefined,
    typedFields: fieldArgs.length > 0 ? fieldArgs : undefined,
    env: optionalStringArg(args, "env"),
    format: optionalStringArg(args, "format") ?? readArgvFlagValue(rawArgs, "--format"),
  };
}

type ApiInvokeInput = {
  delegated: boolean;
  request?: ResolvedApiHttp;
};

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

  return defineHttpCommand({
    id: `api.${method.toLowerCase()}`,
    plane: "management",
    operation: API_HTTP_OPERATION,
    mutates: method !== "GET",
    output: "tabular",
    meta: {
      name: method,
      description: `${method} request to the management REST API.`,
      examples: methodExamples,
    },
    args: API_HTTP_ARGS,
    parse({ args, rawArgs }) {
      return resolveApiHttp(buildApiHttpArgs(args, rawArgs, method));
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

export async function runApiSpecCommand(
  sink: OutputSink,
  options?: { format?: string },
): Promise<void> {
  await writeCommandOutput(apiSpecOutput(sink, options), sink);
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
    pageHumanText: true,
  };
}

export async function runApiRoutesCommand(sink: OutputSink, operationId?: string): Promise<void> {
  await writeCommandOutput(apiRoutesOutput(operationId), sink);
}

const apiSpecCommand = defineOutputCommand({
  id: "api.spec",
  capabilities: ["raw-stdout"],
  output: "raw-api",
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
    return { format: optionalStringArg(args, "format") };
  },
  render(input, { sink }) {
    return apiSpecOutput(sink, input);
  },
});

const apiRoutesCommand = defineOutputCommand({
  id: "api.routes",
  capabilities: [],
  output: "normalized",
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
    return optionalStringArg(args, "operation");
  },
  render(operationId) {
    return apiRoutesOutput(operationId);
  },
});

const apiMethodSubCommands = Object.fromEntries(
  HTTP_METHOD_NAMES.map((method) => [method, createApiMethodCommand(method)]),
);

export const apiCommand = defineOperationCommand<ApiInvokeInput, ApiHttpResult | undefined>({
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
    const delegated = isDelegatedApiCommand(rawArgs);
    return {
      delegated,
      request: delegated ? undefined : resolveApiHttp(buildApiHttpArgs(args, rawArgs)),
    };
  },
  run(input, context) {
    if (input.delegated) {
      return noopPlan<ApiHttpResult | undefined>();
    }
    return API_HTTP_OPERATION.plan(input.request as ResolvedApiHttp, context);
  },
  present(result, { sink }) {
    if (result === undefined) {
      return;
    }
    return apiHttpResultOutput(result, sink);
  },
});
