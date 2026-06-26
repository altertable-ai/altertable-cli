import { parseApiHeaders, resolveApiRequestPayload, type ParsedApiField } from "@/lib/api-body.ts";
import { writeCommandOutput, writeManagementOutput } from "@/lib/command-output.ts";
import { CliError } from "@/lib/errors.ts";
import type { HttpResponseDetail } from "@/lib/http.ts";
import {
  encodeManagementEndpoint,
  managementRequest,
  managementRequestDetailed,
} from "@/lib/management-transport.ts";
import { getOutputSink, type OutputSink } from "@/lib/runtime.ts";

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
  headers?: string[];
  include?: boolean;
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

function formatIncludeOutput(detail: HttpResponseDetail): string {
  const statusLine = `HTTP/1.1 ${detail.status} ${detail.statusText}`.trimEnd();
  const headerLines = Object.entries(detail.headers).map(([name, value]) => `${name}: ${value}`);
  return [statusLine, ...headerLines, "", detail.body].join("\n");
}

export async function runApiHttp(
  args: ApiHttpArgs,
  sink: OutputSink = getOutputSink(),
): Promise<void> {
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

  const extraHeaders =
    args.headers && args.headers.length > 0 ? parseApiHeaders(args.headers) : undefined;

  if (args.include) {
    const detail = await managementRequestDetailed(
      method,
      endpointWithQuery,
      payload.body,
      extraHeaders,
    );
    sink.writeHuman(formatIncludeOutput(detail));
    return;
  }

  const response = await managementRequest(method, endpointWithQuery, payload.body, extraHeaders);

  if (method === "DELETE" && response.trim().length === 0) {
    if (sink.json) {
      writeCommandOutput({ kind: "deleted", message: "" }, sink);
    }
    return;
  }

  if (response.trim().length === 0) {
    return;
  }

  writeManagementOutput(
    response,
    {
      format: args.format ? String(args.format) : undefined,
    },
    sink,
  );
}
