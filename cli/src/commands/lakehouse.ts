import type { ArgsDef } from "citty";
import { CliError } from "@/lib/errors.ts";
import { booleanArg, enumArg, optionalStringArg, stringArg } from "@/lib/operation-codec.ts";
import { httpEffect, progressPlan, scopedPlan } from "@/lib/operation-effect.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { defineGroupCommand, defineHttpCommand } from "@/lib/operation-command-builders.ts";
import {
  PAGER_MODE_OPTIONS,
  parseAppendJsonContent,
  parseQueryOutputOptions,
  parseRequestReadTimeoutMs,
  QUERY_LAYOUT_OPTIONS,
  QUERY_RESULT_FORMAT_OPTIONS,
  validateUploadPrimaryKey,
} from "@/commands/lakehouse-args.ts";
import { writeQueryOutput } from "@/lib/lakehouse-client.ts";
import type { LakehouseQueryResult } from "@/lib/lakehouse-ndjson.ts";
import { createLakehouseUploadRequest } from "@/lib/lakehouse-transport.ts";
import {
  type LakehouseQueryOperationInput,
  lakehouseAppendOperation,
  lakehouseAppendTaskOperation,
  lakehouseQueryCancelOperation,
  lakehouseQueryOperation,
  lakehouseQueryShowOperation,
  lakehouseQueryStreamOperation,
} from "@/lib/lakehouse-operations.ts";

const UPLOAD_MODE_OPTIONS = ["overwrite", "upsert"] as const;

const queryRunArgs = {
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
} satisfies ArgsDef;

const queryGroupArgs = {
  ...queryRunArgs,
  statement: { ...queryRunArgs.statement, required: false },
} satisfies ArgsDef;

const appendRunArgs = {
  catalog: { type: "string", description: "Catalog name", required: true },
  schema: { type: "string", description: "Schema name", required: true },
  table: { type: "string", description: "Table name", required: true },
  data: { type: "string", description: "JSON object, array, or @file", required: true },
  sync: { type: "boolean", description: "Wait for the append task to finish before returning" },
} satisfies ArgsDef;

type QueryRunInput = LakehouseQueryOperationInput & ReturnType<typeof parseQueryOutputOptions>;

const queryRunCommand = defineOperationCommand<QueryRunInput, LakehouseQueryResult>({
  id: "lakehouse.query.run",
  capabilities: ["lakehouse-http", "streaming"],
  catalog: {
    effects: ["http", "http-stream"],
    planes: ["lakehouse"],
    output: "normalized",
  },
  meta: {
    name: "run",
    description: "Run a SQL statement.",
    examples: [
      'altertable query run --statement "SELECT * FROM users LIMIT 10"',
      'altertable query --statement "SELECT 1" --format json',
    ],
  },
  args: queryRunArgs,
  parse({ args, rawArgs }) {
    const statement = stringArg(args, "statement");
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, rawArgs);
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const httpOptions = readTimeoutMs !== undefined ? { readTimeoutMs } : undefined;
    const queryId = optionalStringArg(args, "query-id");
    const sessionId = optionalStringArg(args, "session-id");
    return { statement, format, displayOptions, pagerOptions, httpOptions, queryId, sessionId };
  },
  run(input, context) {
    if (input.format === "json" || context.sink.json) {
      return lakehouseQueryOperation.plan(input, context);
    }

    return lakehouseQueryStreamOperation.plan(input, context);
  },
  async present(result, { sink }, input) {
    await writeQueryOutput(result, input.format, input.displayOptions, input.pagerOptions, sink);
  },
});

const queryShowCommand = defineHttpCommand({
  id: "lakehouse.query.show",
  plane: "lakehouse",
  operation: lakehouseQueryShowOperation,
  output: "raw-api",
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
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const queryCancelCommand = defineHttpCommand({
  id: "lakehouse.query.cancel",
  plane: "lakehouse",
  operation: lakehouseQueryCancelOperation,
  mutates: true,
  output: "raw-api",
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
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

export const queryCommand = defineGroupCommand({
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
  args: queryGroupArgs,
  subCommands: {
    run: queryRunCommand,
    show: queryShowCommand,
    cancel: queryCancelCommand,
  },
});

const appendRowsCommand = defineOperationCommand({
  id: "lakehouse.append.run",
  capabilities: ["lakehouse-http", "progress"],
  catalog: {
    effects: ["http", "progress"],
    planes: ["lakehouse"],
    mutates: true,
    output: "raw-api",
  },
  meta: {
    name: "run",
    description: "Append JSON rows to a table.",
  },
  args: appendRunArgs,
  parse({ args }) {
    const catalog = stringArg(args, "catalog");
    const schema = stringArg(args, "schema");
    const table = stringArg(args, "table");
    const payload = parseAppendJsonContent(stringArg(args, "data"));
    return { catalog, schema, table, payload, sync: booleanArg(args, "sync") };
  },
  run(input, context) {
    const effect = lakehouseAppendOperation.effect(input, context);
    return input.sync
      ? progressPlan("Waiting for append to complete…", effect)
      : lakehouseAppendOperation.plan(input, context);
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const appendTaskCommand = defineHttpCommand({
  id: "lakehouse.append.task",
  plane: "lakehouse",
  operation: lakehouseAppendTaskOperation,
  output: "raw-api",
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
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

export const appendCommand = defineGroupCommand({
  meta: {
    name: "append",
    description: "Append JSON rows to a table.",
    examples: [
      "altertable append --catalog db --schema public --table events --data '[{\"id\":1}]'",
      "altertable append task <task-id>",
    ],
  },
  default: "run",
  args: appendRunArgs,
  subCommands: {
    run: appendRowsCommand,
    task: appendTaskCommand,
  },
});

export const uploadCommand = defineOperationCommand({
  id: "lakehouse.upload",
  capabilities: ["lakehouse-http", "local-file-read", "progress"],
  catalog: {
    effects: ["scope", "http"],
    planes: ["lakehouse"],
    mutates: true,
    output: "raw-api",
  },
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
    return scopedPlan(() => {
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
