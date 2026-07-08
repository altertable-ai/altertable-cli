import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { CliError } from "@/lib/errors.ts";

const PATH_PARAMETER_PATTERN = /\{([^}]+)\}/g;

export type ApiRouteRow = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
};

export type ApiOperationDetails = {
  operationId: string;
  method: string;
  path: string;
  parameters: string[];
  summary: string;
};

export function extractPathParameters(path: string): string[] {
  return [...path.matchAll(PATH_PARAMETER_PATTERN)].map((match) => String(match[1]));
}

export function apiRouteRows(): ApiRouteRow[] {
  return OPENAPI_OPERATIONS.map((operation) => ({
    method: operation.method,
    path: operation.path,
    operationId: operation.operationId,
    summary: operation.summary,
  }));
}

export function apiOperationDetails(operationId: string): ApiOperationDetails {
  const operation = OPENAPI_OPERATIONS.find((candidate) => candidate.operationId === operationId);
  if (!operation) {
    throw new CliError(`Unknown API operation: ${operationId}`);
  }
  return {
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    parameters: extractPathParameters(operation.path),
    summary: operation.summary,
  };
}

export function apiOperationsJson(): typeof OPENAPI_OPERATIONS {
  return OPENAPI_OPERATIONS;
}
