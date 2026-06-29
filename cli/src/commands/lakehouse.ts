import { defineAltertableCommand } from "@/lib/command-context.ts";
import { CliError } from "@/lib/errors.ts";
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
  writeLakehouseOutput,
  writeQueryOutput,
} from "@/lib/lakehouse-client.ts";

const UPLOAD_MODE_OPTIONS = ["overwrite", "upsert"] as const;

const queryRunCommand = defineAltertableCommand({
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
  async run({ args, rawArgs, sink }) {
    const statement = String(args.statement);
    const { format, displayOptions, pagerOptions } = parseQueryOutputOptions(args, rawArgs);
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const httpOptions = readTimeoutMs !== undefined ? { readTimeoutMs } : undefined;
    const queryId = args["query-id"] ? String(args["query-id"]) : undefined;
    const sessionId = args["session-id"] ? String(args["session-id"]) : undefined;

    let result;
    if (format === "json" || sink.json) {
      const response = await lakehouseQuery(statement, queryId, sessionId, httpOptions);
      result = parseLakehouseQueryResponse(response);
    } else {
      result = await lakehouseQueryAll(statement, queryId, sessionId, httpOptions);
    }

    await writeQueryOutput(result, format, displayOptions, pagerOptions, sink);
  },
});

const queryShowCommand = defineAltertableCommand({
  meta: {
    name: "show",
    description: "Fetch metadata for a completed or running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id returned by the API", required: true },
  },
  async run({ args, sink }) {
    const response = await lakehouseGetQuery(String(args["query-id"]));
    writeLakehouseOutput(response, { sink });
  },
});

const queryCancelCommand = defineAltertableCommand({
  meta: {
    name: "cancel",
    description: "Cancel a running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id to cancel", required: true },
    "session-id": { type: "string", description: "Session id that owns the query", required: true },
  },
  async run({ args, sink }) {
    const response = await lakehouseCancel(String(args["query-id"]), String(args["session-id"]));
    writeLakehouseOutput(response, { sink });
  },
});

export const queryCommand = defineAltertableCommand({
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

export const validateCommand = defineAltertableCommand({
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
  async run({ args, sink }) {
    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const response = await lakehouseValidate(
      String(args.statement),
      readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    );
    writeLakehouseOutput(response, { sink });
  },
});

const appendRowsCommand = defineAltertableCommand({
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
  async run({ args, sink }) {
    const catalog = String(args.catalog);
    const schema = String(args.schema);
    const table = String(args.table);
    const payload = parseAppendJsonContent(String(args.data));

    let response: string;
    if (args.sync) {
      const progress = startProgress("Waiting for append to complete…");
      try {
        response = await lakehouseAppend(catalog, schema, table, payload, { sync: true });
        progress.done();
      } catch (error) {
        progress.fail();
        throw error;
      }
    } else {
      response = await lakehouseAppend(catalog, schema, table, payload);
    }
    writeLakehouseOutput(response, { sink });
  },
});

const appendTaskCommand = defineAltertableCommand({
  meta: {
    name: "task",
    description: "Fetch status for an append task.",
  },
  args: {
    "task-id": { type: "positional", description: "Task id returned by append", required: true },
  },
  async run({ args, sink }) {
    const response = await lakehouseGetTask(String(args["task-id"]));
    writeLakehouseOutput(response, { sink });
  },
});

export const appendCommand = defineAltertableCommand({
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

export const uploadCommand = defineAltertableCommand({
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
  async run({ args, sink }) {
    const mode = String(args.mode);
    const filePath = String(args.file);
    validateUploadPrimaryKey(mode, args["primary-key"]);

    try {
      await Bun.file(filePath).arrayBuffer();
    } catch {
      throw new CliError(`File not found: ${filePath}`);
    }

    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const response = await lakehouseUpload(
      String(args.catalog),
      String(args.schema),
      String(args.table),
      String(args.format),
      mode,
      filePath,
      args["primary-key"] ? String(args["primary-key"]) : undefined,
      readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    );
    writeLakehouseOutput(response, { sink });
  },
});

export const autocompleteCommand = defineAltertableCommand({
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
  async run({ args, sink }) {
    const maxSuggestionsRaw = args["max-suggestions"];
    const maxSuggestions =
      maxSuggestionsRaw !== undefined ? Number.parseInt(String(maxSuggestionsRaw), 10) : undefined;
    if (maxSuggestions !== undefined && Number.isNaN(maxSuggestions)) {
      throw new CliError("--max-suggestions must be a number.");
    }

    const response = await lakehouseAutocomplete({
      statement: String(args.statement),
      catalog: args.catalog ? String(args.catalog) : undefined,
      schema: args.schema ? String(args.schema) : undefined,
      sessionId: args["session-id"] ? String(args["session-id"]) : undefined,
      maxSuggestions,
    });

    writeLakehouseOutput(response, { humanFormatter: formatAutocompleteHumanOutput, sink });
  },
});
