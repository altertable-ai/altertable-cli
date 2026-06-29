import { CliError } from "@/lib/errors.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { startProgress } from "@/lib/progress.ts";
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
  lakehouseAppend,
  lakehouseAutocomplete,
  lakehouseCancel,
  lakehouseGetQuery,
  lakehouseGetTask,
  lakehouseQuery,
  lakehouseQueryAll,
  lakehouseUpload,
  lakehouseValidate,
  parseLakehouseQueryResponse,
  writeQueryOutput,
} from "@/lib/lakehouse-client.ts";

const UPLOAD_MODE_OPTIONS = ["overwrite", "upsert"] as const;

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const queryRunCommand = defineOperationCommand({
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
    const statement = String(args.statement);
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, rawArgs);
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const httpOptions = readTimeoutMs !== undefined ? { readTimeoutMs } : undefined;
    const queryId = optionalString(args["query-id"]);
    const sessionId = optionalString(args["session-id"]);
    return { statement, format, displayOptions, pagerOptions, httpOptions, queryId, sessionId };
  },
  async run(input, { sink, execution }) {
    const { statement, format, httpOptions, queryId, sessionId } = input;

    let result;
    if (format === "json" || sink.json) {
      const response = await lakehouseQuery(statement, queryId, sessionId, httpOptions, execution);
      result = parseLakehouseQueryResponse(response);
    } else {
      result = await lakehouseQueryAll(statement, queryId, sessionId, httpOptions, execution);
    }

    return result;
  },
  async present(result, { sink }, input) {
    await writeQueryOutput(result, input.format, input.displayOptions, input.pagerOptions, sink);
  },
});

const queryShowCommand = defineOperationCommand({
  meta: {
    name: "show",
    description: "Fetch metadata for a completed or running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id returned by the API", required: true },
  },
  parse({ args }) {
    return String(args["query-id"]);
  },
  run(queryId, { execution }) {
    return lakehouseGetQuery(queryId, execution);
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const queryCancelCommand = defineOperationCommand({
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
      queryId: String(args["query-id"]),
      sessionId: String(args["session-id"]),
    };
  },
  run(input, { execution }) {
    return lakehouseCancel(input.queryId, input.sessionId, execution);
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
      statement: String(args.statement),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
  },
  run(input, { execution }) {
    return lakehouseValidate(input.statement, input.httpOptions, execution);
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const appendRowsCommand = defineOperationCommand({
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
    const catalog = String(args.catalog);
    const schema = String(args.schema);
    const table = String(args.table);
    const payload = parseAppendJsonContent(String(args.data));
    return { catalog, schema, table, payload, sync: args.sync === true };
  },
  async run(input, { execution }) {
    const { catalog, schema, table, payload } = input;

    let response: string;
    if (input.sync) {
      const progress = startProgress("Waiting for append to complete…");
      try {
        response = await lakehouseAppend(
          catalog,
          schema,
          table,
          payload,
          { sync: true },
          execution,
        );
        progress.done();
      } catch (error) {
        progress.fail();
        throw error;
      }
    } else {
      response = await lakehouseAppend(catalog, schema, table, payload, {}, execution);
    }
    return response;
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const appendTaskCommand = defineOperationCommand({
  meta: {
    name: "task",
    description: "Fetch status for an append task.",
  },
  args: {
    "task-id": { type: "positional", description: "Task id returned by append", required: true },
  },
  parse({ args }) {
    return String(args["task-id"]);
  },
  run(taskId, { execution }) {
    return lakehouseGetTask(taskId, execution);
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
    const mode = String(args.mode);
    const filePath = String(args.file);
    validateUploadPrimaryKey(mode, args["primary-key"]);

    try {
      await Bun.file(filePath).arrayBuffer();
    } catch {
      throw new CliError(`File not found: ${filePath}`);
    }

    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    return {
      catalog: String(args.catalog),
      schema: String(args.schema),
      table: String(args.table),
      format: String(args.format),
      mode,
      filePath,
      primaryKey: optionalString(args["primary-key"]),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
  },
  run(input, { execution }) {
    return lakehouseUpload(
      input.catalog,
      input.schema,
      input.table,
      input.format,
      input.mode,
      input.filePath,
      input.primaryKey,
      input.httpOptions,
      execution,
    );
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

export const autocompleteCommand = defineOperationCommand({
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
    const maxSuggestionsRaw = args["max-suggestions"];
    const maxSuggestions =
      typeof maxSuggestionsRaw === "string" ? Number.parseInt(maxSuggestionsRaw, 10) : undefined;
    if (maxSuggestions !== undefined && Number.isNaN(maxSuggestions)) {
      throw new CliError("--max-suggestions must be a number.");
    }

    return {
      statement: String(args.statement),
      catalog: optionalString(args.catalog),
      schema: optionalString(args.schema),
      sessionId: optionalString(args["session-id"]),
      maxSuggestions,
    };
  },
  run(input, { execution }) {
    return lakehouseAutocomplete(input, execution);
  },
  present(response) {
    return {
      kind: "raw_api",
      body: response,
      humanFormatter: formatAutocompleteHumanOutput,
    };
  },
});
