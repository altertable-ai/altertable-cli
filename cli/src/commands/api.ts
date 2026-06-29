import type { ArgsDef } from "citty";
import {
  getOpenapiSpecJson,
  getOpenapiSpecYaml,
  resolveOpenapiSpecFormat,
} from "@/lib/openapi-spec.ts";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { runApiHttp } from "@/lib/api-http.ts";
import { extractFieldArgs, extractRawFieldArgs } from "@/lib/api-body.ts";
import { CliError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
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

function valueFlagsFor(args: ArgsDef): ReadonlySet<string> {
  const flags = new Set<string>();
  for (const [name, definition] of Object.entries(args)) {
    if (definition.type !== "string" && definition.type !== "enum") {
      continue;
    }

    flags.add(`--${name}`);
    const aliases = Array.isArray(definition.alias)
      ? definition.alias
      : definition.alias
        ? [definition.alias]
        : [];
    for (const alias of aliases) {
      flags.add(`-${alias}`);
    }
  }
  return flags;
}

const API_VALUE_FLAGS = valueFlagsFor(API_HTTP_BASE_ARGS);

function findFirstPositionalIndex(
  rawArgs: readonly string[],
  valueFlags: ReadonlySet<string>,
): number {
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--") {
      return -1;
    }
    if (arg.startsWith("-")) {
      if (!arg.includes("=") && valueFlags.has(arg)) {
        index += 1;
      }
      continue;
    }
    return index;
  }
  return -1;
}

function isHttpMethodName(value: string): boolean {
  return HTTP_METHOD_NAME_SET.has(value.toUpperCase());
}

function isApiCommandName(value: string): boolean {
  return API_META_COMMAND_NAMES.has(value) || isHttpMethodName(value);
}

/** Citty treats endpoint paths as subcommand names unless we separate them with `--`. */
export function normalizeApiInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: ArgsDef = {},
): string[] {
  const apiIndex = findFirstPositionalIndex(rawArgs, valueFlagsFor(rootArgs));
  if (apiIndex === -1 || rawArgs[apiIndex] !== "api") {
    return [...rawArgs];
  }

  const afterApi = rawArgs.slice(apiIndex + 1);
  if (afterApi.includes("--")) {
    return [...rawArgs];
  }

  const endpointIndex = findFirstPositionalIndex(afterApi, API_VALUE_FLAGS);
  if (endpointIndex === -1) {
    return [...rawArgs];
  }

  const endpoint = afterApi[endpointIndex];
  if (!endpoint || isApiCommandName(endpoint)) {
    return [...rawArgs];
  }

  const normalized = [...rawArgs];
  normalized.splice(apiIndex + 1 + endpointIndex, 0, "--");
  return normalized;
}

const API_HTTP_ARGS = withManagementFormatArg(API_HTTP_BASE_ARGS);

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

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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

  return defineAltertableCommand({
    meta: {
      name: method,
      description: `${method} request to the management REST API.`,
      examples: methodExamples,
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

export function runApiSpecCommand(sink: OutputSink, options?: { format?: string }): void {
  const format = resolveOpenapiSpecFormat(
    sink.json,
    process.stdout.isTTY === true,
    options?.format,
  );

  if (format === "json") {
    writeCommandOutput({ kind: "raw_api", body: getOpenapiSpecJson() }, sink);
    return;
  }

  writeCommandOutput({ kind: "human", text: getOpenapiSpecYaml() }, sink);
}

export function runApiRoutesCommand(sink: OutputSink, operationId?: string): void {
  if (operationId) {
    writeCommandOutput(
      {
        kind: "normalized",
        data: operationDetailsJson(operationId),
        humanText: formatOperationDetails(operationId),
      },
      sink,
    );
    return;
  }

  const table = renderApiRoutesTableSection(
    OPENAPI_OPERATIONS.map((operation) => ({
      method: operation.method,
      path: operation.path,
      operationId: operation.operationId,
      summary: operation.summary,
    })),
  );
  writeCommandOutput(
    {
      kind: "normalized",
      data: OPENAPI_OPERATIONS,
      humanText: table,
    },
    sink,
  );
}

const apiSpecCommand = defineAltertableCommand({
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
  run({ args, sink }) {
    runApiSpecCommand(sink, { format: stringArg(args.format) });
  },
});

const apiRoutesCommand = defineAltertableCommand({
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
  async run({ args, rawArgs, sink }) {
    const subCommandIndex = findFirstPositionalIndex(rawArgs, API_VALUE_FLAGS);
    const subCommandName = subCommandIndex === -1 ? undefined : rawArgs[subCommandIndex];
    if (subCommandName && isApiCommandName(subCommandName)) {
      return;
    }
    await runApiHttp(buildApiHttpArgs(args, rawArgs), sink);
  },
});
