import { CliError } from "@/lib/errors.ts";
import { urlencode } from "@/lib/encode.ts";
import {
  booleanArg,
  enumArg,
  optionalIntegerArg,
  optionalStringArg,
  stringArg,
} from "@/lib/operation-codec.ts";
import {
  httpEffect,
  httpStreamEffect,
  progressEffect,
  scopedEffect,
} from "@/lib/operation-effect.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { STREAM_READ_TIMEOUT_MS } from "@/lib/transport-defaults.ts";
import {
  PAGER_MODE_OPTIONS,
  parseAppendJsonContent,
  parseQueryOutputOptions,
  parseRequestReadTimeoutMs,
  QUERY_LAYOUT_OPTIONS,
  QUERY_RESULT_FORMAT_OPTIONS,
  validateUploadPrimaryKey,
} from "@/commands/lakehouse-args.ts";
import {
  formatAutocompleteHumanOutput,
  parseLakehouseQueryResponse,
  writeQueryOutput,
} from "@/lib/lakehouse-client.ts";
import { parseLakehouseQueryStream, type LakehouseQueryResult } from "@/lib/lakehouse-ndjson.ts";
import {
  buildLakehouseAppendRequest,
  createLakehouseUploadRequest,
} from "@/lib/lakehouse-transport.ts";

const UPLOAD_MODE_OPTIONS = ["overwrite", "upsert"] as const;

function buildLakehouseQueryPayload(
  statement: string,
  queryId?: string,
  sessionId?: string,
): Record<string, string> {
  const payload: Record<string, string> = { statement };
  if (queryId) {
    payload.query_id = queryId;
  }
  if (sessionId) {
    payload.session_id = sessionId;
  }
  return payload;
}

async function collectLakehouseQueryStream(
  stream: ReadableStream<Uint8Array>,
): Promise<LakehouseQueryResult> {
  const parser = parseLakehouseQueryStream(stream);
  while (true) {
    const next = await parser.next();
    if (next.done) {
      return next.value;
    }
  }
}

const queryRunCommand = defineOperationCommand({
  id: "lakehouse.query.run",
  capabilities: ["lakehouse-http", "streaming"],
  meta: {
    name: "run",
    description: "Run a SQL statement.",
    examples: [
      'altertable query run --statement "SELECT * FROM users LIMIT 10"',
      'altertable query --statement "SELECT 1" --format json',
    ],
  },
  args: {
    statement: { type: "string", description: "SQL statement to run", required: true },
    format: {
      type: "enum",
      description: "Output format: human, json, csv, or markdown",
      default: "human",
      options: [...QUERY_RESULT_FORMAT_OPTIONS],
    },
    layout: {
      type: "enum",
      description: "Human layout: auto, table, or line",
      options: [...QUERY_LAYOUT_OPTIONS],
    },
    "query-id": { type: "string", description: "Optional stable query id" },
    "session-id": { type: "string", description: "Optional session id" },
    columns: {
      type: "string",
      description: "Comma-separated columns to show",
    },
    "max-width": {
      type: "string",
      description: "Maximum display width for table columns",
      default: "32",
    },
    pager: {
      type: "enum",
      description: "Pager mode for human output: auto, always, or never",
      default: "auto",
      options: [...PAGER_MODE_OPTIONS],
    },
    "read-timeout": {
      type: "string",
      description: "Read timeout in seconds for this request (overrides global --read-timeout)",
    },
  },
  parse({ args, rawArgs }) {
    const statement = stringArg(args, "statement");
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, rawArgs);
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const httpOptions = readTimeoutMs !== undefined ? { readTimeoutMs } : undefined;
    const queryId = optionalStringArg(args, "query-id");
    const sessionId = optionalStringArg(args, "session-id");
    return { statement, format, displayOptions, pagerOptions, httpOptions, queryId, sessionId };
  },
  run(input, { sink }) {
    const { statement, format, httpOptions, queryId, sessionId } = input;
    const body = JSON.stringify(buildLakehouseQueryPayload(statement, queryId, sessionId));

    if (format === "json" || sink.json) {
      return httpEffect(
        {
          plane: "lakehouse",
          method: "POST",
          endpoint: "/query",
          body,
          contentType: "application/json",
          ...httpOptions,
        },
        parseLakehouseQueryResponse,
      );
    }

    return httpStreamEffect(
      {
        plane: "lakehouse",
        method: "POST",
        endpoint: "/query",
        body,
        contentType: "application/json",
        readTimeoutMs: httpOptions?.readTimeoutMs ?? STREAM_READ_TIMEOUT_MS,
        retry: false,
        ...httpOptions,
      },
      collectLakehouseQueryStream,
    );
  },
  async present(result, { sink }, input) {
    await writeQueryOutput(result, input.format, input.displayOptions, input.pagerOptions, sink);
  },
});

const queryShowCommand = defineOperationCommand({
  id: "lakehouse.query.show",
  capabilities: ["lakehouse-http"],
  meta: {
    name: "show",
    description: "Fetch metadata for a completed or running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id returned by the API", required: true },
  },
  parse({ args }) {
    return stringArg(args, "query-id");
  },
  run(queryId) {
    return httpEffect({
      plane: "lakehouse",
      method: "GET",
      endpoint: `/query/${urlencode(queryId)}`,
      retry: true,
    });
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const queryCancelCommand = defineOperationCommand({
  id: "lakehouse.query.cancel",
  capabilities: ["lakehouse-http"],
  meta: {
    name: "cancel",
    description: "Cancel a running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id to cancel", required: true },
    "session-id": { type: "string", description: "Session id that owns the query", required: true },
  },
  parse({ args }) {
    return {
      queryId: stringArg(args, "query-id"),
      sessionId: stringArg(args, "session-id"),
    };
  },
  run(input) {
    const params = new URLSearchParams({ session_id: input.sessionId });
    return httpEffect({
      plane: "lakehouse",
      method: "DELETE",
      endpoint: `/query/${urlencode(input.queryId)}?${params.toString()}`,
    });
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

export const queryCommand = defineOperationCommand({
  meta: {
    name: "query",
    description: "Run SQL queries against the lakehouse.",
    examples: [
      'altertable query --statement "SELECT * FROM users LIMIT 10"',
      'altertable query --statement "SELECT 1" --format json',
      "altertable query show <query-id>",
    ],
  },
  default: "run",
  args: {
    statement: { type: "string", description: "SQL statement to run" },
    format: {
      type: "enum",
      description: "Output format: human, json, csv, or markdown",
      options: [...QUERY_RESULT_FORMAT_OPTIONS],
    },
    layout: {
      type: "enum",
      description: "Human layout: auto, table, or line",
      options: [...QUERY_LAYOUT_OPTIONS],
    },
    "query-id": { type: "string", description: "Optional stable query id" },
    "session-id": { type: "string", description: "Optional session id" },
    columns: {
      type: "string",
      description: "Comma-separated columns to show",
    },
    "max-width": { type: "string", description: "Maximum display width for table columns" },
    pager: {
      type: "enum",
      description: "Pager mode for human output: auto, always, or never",
      options: [...PAGER_MODE_OPTIONS],
    },
    "read-timeout": {
      type: "string",
      description: "Read timeout in seconds for this request (overrides global --read-timeout)",
    },
  },
  subCommands: {
    run: queryRunCommand,
    show: queryShowCommand,
    cancel: queryCancelCommand,
  },
});

export const validateCommand = defineOperationCommand({
  id: "lakehouse.validate",
  capabilities: ["lakehouse-http"],
  meta: {
    name: "validate",
    description: "Validate a SQL statement without executing it.",
    examples: ['altertable validate --statement "SELECT 1"'],
  },
  args: {
    statement: { type: "string", description: "SQL to validate", required: true },
    "read-timeout": {
      type: "string",
      description: "Read timeout in seconds for this request (overrides global --read-timeout)",
    },
  },
  parse({ args }) {
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    return {
      statement: stringArg(args, "statement"),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
  },
  run(input) {
    return httpEffect({
      plane: "lakehouse",
      method: "POST",
      endpoint: "/validate",
      body: JSON.stringify({ statement: input.statement }),
      contentType: "application/json",
      ...input.httpOptions,
    });
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const appendRowsCommand = defineOperationCommand({
  id: "lakehouse.append.run",
  capabilities: ["lakehouse-http", "progress"],
  meta: {
    name: "run",
    description: "Append JSON rows to a table.",
  },
  args: {
    catalog: { type: "string", required: true },
    schema: { type: "string", required: true },
    table: { type: "string", required: true },
    data: { type: "string", description: "JSON object, array, or @file", required: true },
    sync: { type: "boolean", description: "Wait for the append task to finish before returning" },
  },
  parse({ args }) {
    const catalog = stringArg(args, "catalog");
    const schema = stringArg(args, "schema");
    const table = stringArg(args, "table");
    const payload = parseAppendJsonContent(stringArg(args, "data"));
    return { catalog, schema, table, payload, sync: booleanArg(args, "sync") };
  },
  run(input) {
    const { catalog, schema, table, payload } = input;
    const request = buildLakehouseAppendRequest({
      catalog,
      schema,
      table,
      jsonContent: payload,
      options: { sync: input.sync },
    });
    const effect = httpEffect(request);
    return input.sync ? progressEffect("Waiting for append to complete…", effect) : effect;
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const appendTaskCommand = defineOperationCommand({
  id: "lakehouse.append.task",
  capabilities: ["lakehouse-http"],
  meta: {
    name: "task",
    description: "Fetch status for an append task.",
  },
  args: {
    "task-id": { type: "positional", description: "Task id returned by append", required: true },
  },
  parse({ args }) {
    return stringArg(args, "task-id");
  },
  run(taskId) {
    return httpEffect({
      plane: "lakehouse",
      method: "GET",
      endpoint: `/tasks/${urlencode(taskId)}`,
      retry: true,
    });
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

export const appendCommand = defineOperationCommand({
  meta: {
    name: "append",
    description: "Append JSON rows to a table.",
    examples: [
      "altertable append --catalog db --schema public --table events --data '[{\"id\":1}]'",
      "altertable append task <task-id>",
    ],
  },
  default: "run",
  args: {
    catalog: { type: "string", description: "Catalog name" },
    schema: { type: "string", description: "Schema name" },
    table: { type: "string", description: "Table name" },
    data: { type: "string", description: "JSON object, array, or @file" },
    sync: { type: "boolean", description: "Wait for the append task to finish before returning" },
  },
  subCommands: {
    run: appendRowsCommand,
    task: appendTaskCommand,
  },
});

export const uploadCommand = defineOperationCommand({
  id: "lakehouse.upload",
  capabilities: ["lakehouse-http", "local-file-read", "progress"],
  meta: {
    name: "upload",
    description: "Upload a file to create or update a table.",
    examples: [
      "altertable upload --catalog db --schema public --table users --format csv --mode overwrite --file users.csv",
    ],
  },
  args: {
    catalog: { type: "string", required: true },
    schema: { type: "string", required: true },
    table: { type: "string", required: true },
    format: { type: "string", description: "File format, e.g. csv", required: true },
    mode: {
      type: "enum",
      description: "overwrite or upsert",
      required: true,
      options: [...UPLOAD_MODE_OPTIONS],
    },
    "primary-key": {
      type: "string",
      description: "Required when --mode is upsert (comma-separated)",
    },
    file: { type: "string", description: "Local file to upload", required: true },
    "read-timeout": {
      type: "string",
      description: "Read timeout in seconds for this request (overrides global --read-timeout)",
    },
  },
  async parse({ args }) {
    const mode = enumArg(args, "mode", UPLOAD_MODE_OPTIONS);
    const filePath = stringArg(args, "file");
    validateUploadPrimaryKey(mode, args["primary-key"]);

    try {
      await Bun.file(filePath).arrayBuffer();
    } catch {
      throw new CliError(`File not found: ${filePath}`);
    }

    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    return {
      catalog: stringArg(args, "catalog"),
      schema: stringArg(args, "schema"),
      table: stringArg(args, "table"),
      format: stringArg(args, "format"),
      mode,
      filePath,
      primaryKey: optionalStringArg(args, "primary-key"),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
  },
  run(input) {
    return scopedEffect(() => {
      const scope = createLakehouseUploadRequest({
        catalog: input.catalog,
        schema: input.schema,
        table: input.table,
        format: input.format,
        mode: input.mode,
        filePath: input.filePath,
        primaryKey: input.primaryKey,
        httpOptions: input.httpOptions,
      });
      return {
        effect: httpEffect(scope.request),
        release: scope.release,
      };
    });
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

export const autocompleteCommand = defineOperationCommand({
  id: "lakehouse.autocomplete",
  capabilities: ["lakehouse-http"],
  meta: {
    name: "autocomplete",
    description: "Get SQL autocomplete suggestions.",
    examples: ['altertable autocomplete --statement "SELECT * FROM "'],
  },
  args: {
    statement: { type: "string", description: "Partial SQL statement", required: true },
    catalog: { type: "string", description: "Optional catalog context" },
    schema: { type: "string", description: "Optional schema context" },
    "session-id": { type: "string", description: "Optional session id" },
    "max-suggestions": { type: "string", description: "Maximum number of suggestions" },
  },
  parse({ args }) {
    return {
      statement: stringArg(args, "statement"),
      catalog: optionalStringArg(args, "catalog"),
      schema: optionalStringArg(args, "schema"),
      sessionId: optionalStringArg(args, "session-id"),
      maxSuggestions: optionalIntegerArg(args, "max-suggestions"),
    };
  },
  run(input) {
    const payload: Record<string, string | number> = { statement: input.statement };
    if (input.catalog) {
      payload.catalog = input.catalog;
    }
    if (input.schema) {
      payload.schema = input.schema;
    }
    if (input.sessionId) {
      payload.session_id = input.sessionId;
    }
    if (input.maxSuggestions !== undefined) {
      payload.max_suggestions = input.maxSuggestions;
    }
    return httpEffect({
      plane: "lakehouse",
      method: "POST",
      endpoint: "/autocomplete",
      body: JSON.stringify(payload),
      contentType: "application/json",
    });
  },
  present(response) {
    return {
      kind: "raw_api",
      body: response,
      humanFormatter: formatAutocompleteHumanOutput,
    };
  },
});
