import { readFile } from 'node:fs/promises';

import { CliError, EXIT_VALIDATION } from '@/lib/errors.ts';
import type { HttpRequest } from '@/lib/http-request.ts';

export type RemoteDataAppPayload = {
  title?: string;
  description?: string;
  index_tsx?: string;
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

export async function readRequiredFile(
  path: string,
  label: string
): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new CliError(`Could not read ${label}: ${path}`, { cause: error });
  }
}

export function buildDataAppHttpRequest(
  env: string,
  method: string,
  path: string,
  body: RemoteDataAppPayload
): HttpRequest {
  return {
    plane: 'management',
    method,
    endpoint: `/environments/${env}${path}`,
    body: JSON.stringify(body),
    contentType: 'application/json',
  };
}

export function validationHasErrors(
  response: ValidateDataAppResponse
): boolean {
  return Array.isArray(response.errors) && response.errors.length > 0;
}

export function formatValidationSummary(
  response: ValidateDataAppResponse
): string {
  const errors = response.errors ?? [];
  const warnings = response.warnings ?? [];
  if (errors.length === 0 && warnings.length === 0) {
    return 'Data app is valid.';
  }
  const lines: string[] = [];
  for (const error of errors) {
    lines.push(formatDiagnostic('error', error));
  }
  for (const warning of warnings) {
    lines.push(formatDiagnostic('warning', warning));
  }
  return lines.join('\n');
}

export function validationExitCode(response: ValidateDataAppResponse): number {
  return validationHasErrors(response) ? EXIT_VALIDATION : 0;
}

function formatDiagnostic(
  kind: 'error' | 'warning',
  diagnostic: ValidationDiagnostic
): string {
  const location =
    diagnostic.line === undefined || diagnostic.line === null
      ? ''
      : diagnostic.column === undefined || diagnostic.column === null
        ? `:${diagnostic.line}`
        : `:${diagnostic.line}:${diagnostic.column}`;
  const source =
    diagnostic.source === undefined ? '' : ` [${diagnostic.source}]`;
  return `${kind}${source}${location}: ${diagnostic.message ?? 'unknown'}`;
}
