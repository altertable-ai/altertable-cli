import { resolveApiRequestPayload, type ParsedApiField } from "@/lib/api-body.ts";
import type { CommandOutputMode } from "@/lib/command-output.ts";
import { CliError } from "@/lib/errors.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { parseManagementOutputFormat } from "@/lib/lakehouse-client.ts";
import { httpEffect, type OperationEffect } from "@/lib/operation-effect.ts";
import type { OutputSink } from "@/lib/runtime.ts";

export type ApiHttpArgs = {
  method?: string;
  endpoint?: string;
  body?: string;
  input?: string;
  rawFields?: Record<string, string> | string[] | string;
  typedFields?: Record<string, string> | string[] | string;
  fields?: Record<string, string> | string[] | string;
  env?: string;
  format?: string;
};

export type ResolvedApiHttp = {
  method: string;
  endpoint: string;
  body?: string;
  format?: string;
};

export type ApiHttpResult = {
  method: string;
  response: string;
  format?: string;
};

export function normalizeApiEndpoint(endpoint: string, env?: string): string {
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) {
    throw new CliError("Endpoint path is required, e.g. /whoami.");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    throw new CliError("Pass a path relative to /rest/v1, not a full URL.");
  }

  let path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (env) {
    path = path.replaceAll("{environment_id}", env);
  }
  return path;
}

function hasFields(fields: Record<string, string> | string[] | string | undefined): boolean {
  if (fields === undefined) {
    return false;
  }
  if (typeof fields === "string") {
    return fields.length > 0;
  }
  if (Array.isArray(fields)) {
    return fields.length > 0;
  }
  return Object.keys(fields).length > 0;
}

function resolveApiMethod(args: ApiHttpArgs): string {
  if (args.method && args.method.trim().length > 0) {
    return args.method.toUpperCase();
  }

  if (
    args.body ||
    args.input ||
    hasFields(args.rawFields) ||
    hasFields(args.typedFields) ||
    hasFields(args.fields)
  ) {
    return "POST";
  }

  return "GET";
}

function appendQueryFields(endpoint: string, fields: ParsedApiField[]): string {
  if (fields.length === 0) {
    return endpoint;
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const searchParams = new URLSearchParams();
  for (const field of fields) {
    searchParams.append(field.key, field.value === null ? "null" : String(field.value));
  }
  return `${endpoint}${separator}${searchParams.toString()}`;
}

export function resolveApiHttp(args: ApiHttpArgs): ResolvedApiHttp {
  if (!args.endpoint) {
    throw new CliError("Endpoint path is required, e.g. /whoami.");
  }

  const method = resolveApiMethod(args);
  const endpoint = normalizeApiEndpoint(args.endpoint, args.env ? String(args.env) : undefined);
  const payload = resolveApiRequestPayload({
    method,
    body: args.body ? String(args.body) : undefined,
    input: args.input ? String(args.input) : undefined,
    rawFields: args.rawFields ?? args.fields,
    typedFields: args.typedFields,
  });
  const endpointWithQuery = appendQueryFields(endpoint, payload.queryFields);
  encodeManagementEndpoint(endpointWithQuery);

  return {
    method,
    endpoint: endpointWithQuery,
    body: payload.body,
    format: args.format ? String(args.format) : undefined,
  };
}

export function apiHttpEffect(args: ApiHttpArgs): OperationEffect<ApiHttpResult> {
  const resolved = resolveApiHttp(args);
  return httpEffect<ApiHttpResult>(
    {
      plane: "management",
      method: resolved.method,
      endpoint: resolved.endpoint,
      body: resolved.body,
      contentType: resolved.body ? "application/json" : undefined,
    },
    (response) => ({ method: resolved.method, response, format: resolved.format }),
  );
}

export function apiHttpResultOutput(
  result: ApiHttpResult,
  sink: OutputSink,
): CommandOutputMode | undefined {
  if (result.method === "DELETE" && result.response.trim().length === 0) {
    if (sink.json) {
      return { kind: "deleted", message: "" };
    }
    return;
  }

  if (result.response.trim().length === 0) {
    return;
  }

  return {
    kind: "tabular",
    body: result.response,
    format: result.format ? parseManagementOutputFormat(result.format) : undefined,
  };
}
