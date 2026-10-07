import { readFile } from "node:fs/promises";
import { CliError, EXIT_VALIDATION } from "@/lib/errors.ts";
import type { HttpRequest } from "@/lib/http-request.ts";

export type DataAppQuery = { id: string; sql: string };
export type DataAppVariable = Record<string, unknown>;

export type RemoteDataAppPayload = {
  title?: string;
  description?: string;
  index_tsx?: string;
  queries?: DataAppQuery[];
  variables?: DataAppVariable[];
};

export type ValidationDiagnostic = {
  message?: string;
  line?: number | null;
  column?: number | null;
  source?: string;
};

export type ValidateDataAppResponse = {
  errors?: ValidationDiagnostic[];
  warnings?: ValidationDiagnostic[];
};

export type PublishedDataApp = {
  slug?: string;
  url?: string;
  title?: string;
};

export async function readRequiredFile(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new CliError(`Could not read ${label}: ${path}`, { cause: error });
  }
}

export async function readJsonFile(path: string, label: string): Promise<unknown> {
  const text = await readRequiredFile(path, label);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(`${label} is not valid JSON: ${path}`, { cause: error });
  }
}

export function parseQueries(value: unknown): DataAppQuery[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new CliError(`queries[${index}] must be an object with id and sql.`);
      }
      const { id, sql } = entry as { id?: unknown; sql?: unknown };
      if (typeof id !== "string" || typeof sql !== "string") {
        throw new CliError(`queries[${index}] id and sql must be strings.`);
      }
      return { id, sql };
    });
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).map(([id, sql]) => {
      if (typeof sql !== "string") {
        throw new CliError(`queries.${id} must be a SQL string.`);
      }
      return { id, sql };
    });
  }
  throw new CliError("queries must be a JSON object or an array of {id, sql}.");
}

export function parseVariables(value: unknown): DataAppVariable[] {
  if (!Array.isArray(value)) {
    throw new CliError("variables must be a JSON array.");
  }
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new CliError(`variables[${index}] must be an object.`);
    }
    const variable = { ...(entry as Record<string, unknown>) };
    if (variable.default === undefined && variable.value !== undefined) {
      variable.default = variable.value;
      delete variable.value;
    }
    return variable;
  });
}

export async function readQueriesFile(path: string): Promise<DataAppQuery[]> {
  return parseQueries(await readJsonFile(path, "queries"));
}

export async function readVariablesFile(path: string | undefined): Promise<DataAppVariable[]> {
  if (path === undefined) {
    return [];
  }
  return parseVariables(await readJsonFile(path, "variables"));
}

export function buildDataAppHttpRequest(
  env: string,
  method: string,
  path: string,
  body: RemoteDataAppPayload,
): HttpRequest {
  return {
    plane: "management",
    method,
    endpoint: `/environments/${env}${path}`,
    body: JSON.stringify(body),
    contentType: "application/json",
  };
}

export function validationHasErrors(response: ValidateDataAppResponse): boolean {
  return Array.isArray(response.errors) && response.errors.length > 0;
}

export function formatValidationSummary(response: ValidateDataAppResponse): string {
  const errors = response.errors ?? [];
  const warnings = response.warnings ?? [];
  if (errors.length === 0 && warnings.length === 0) {
    return "Data app is valid.";
  }
  const lines: string[] = [];
  for (const error of errors) {
    lines.push(formatDiagnostic("error", error));
  }
  for (const warning of warnings) {
    lines.push(formatDiagnostic("warning", warning));
  }
  return lines.join("\n");
}

export function validationExitCode(response: ValidateDataAppResponse): number {
  return validationHasErrors(response) ? EXIT_VALIDATION : 0;
}

function formatDiagnostic(kind: "error" | "warning", diagnostic: ValidationDiagnostic): string {
  const location =
    diagnostic.line === undefined || diagnostic.line === null
      ? ""
      : diagnostic.column === undefined || diagnostic.column === null
        ? `:${diagnostic.line}`
        : `:${diagnostic.line}:${diagnostic.column}`;
  const source = diagnostic.source === undefined ? "" : ` [${diagnostic.source}]`;
  return `${kind}${source}${location}: ${diagnostic.message ?? "unknown"}`;
}
