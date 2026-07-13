import { optionalStringArg, stringArg } from "@/lib/operation-codec.ts";
import { httpEffect, scopedPlan } from "@/lib/operation-effect.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import {
  parseLakehouseFileContentType,
  parseRequestReadTimeoutMs,
} from "@/commands/lakehouse-args.ts";
import {
  getUploadFileSizeBytes,
  LAKEHOUSE_FILE_FORMAT_OPTIONS,
} from "@/commands/lakehouse/upload.ts";
import { createLakehouseUpsertRequest } from "@/lib/lakehouse-transport.ts";

export const upsertCommand = defineOperationCommand({
  id: "lakehouse.upsert",
  capabilities: ["lakehouse-http", "local-file-read", "progress"],
  catalog: {
    effects: ["scope", "http"],
    planes: ["lakehouse"],
    mutates: true,
    output: "raw-api",
  },
  meta: {
    name: "upsert",
    commandGroup: "ingest",
    description: "Upload a file and match existing rows by primary key.",
    examples: [
      "altertable upsert --catalog db --schema public --table users --primary-key id --format csv --file users.csv",
    ],
  },
  args: {
    catalog: { type: "string", required: true },
    schema: { type: "string", required: true },
    table: { type: "string", required: true },
    "primary-key": {
      type: "string",
      description: "Column name used to match existing rows",
      required: true,
    },
    format: {
      type: "enum",
      description: "Optional file format hint for the Content-Type header",
      options: [...LAKEHOUSE_FILE_FORMAT_OPTIONS],
    },
    file: { type: "string", description: "Local file to upload", required: true },
    "read-timeout": {
      type: "string",
      description: "Read timeout in seconds for this request (overrides global --read-timeout)",
    },
  },
  async parse({ args }) {
    const filePath = stringArg(args, "file");
    const fileSizeBytes = getUploadFileSizeBytes(filePath);

    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    return {
      catalog: stringArg(args, "catalog"),
      schema: stringArg(args, "schema"),
      table: stringArg(args, "table"),
      primaryKey: stringArg(args, "primary-key"),
      filePath,
      fileSizeBytes,
      contentType: parseLakehouseFileContentType(optionalStringArg(args, "format")),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
  },
  run(input) {
    return scopedPlan(() => {
      const scope = createLakehouseUpsertRequest({
        catalog: input.catalog,
        schema: input.schema,
        table: input.table,
        primaryKey: input.primaryKey,
        filePath: input.filePath,
        fileSizeBytes: input.fileSizeBytes,
        contentType: input.contentType,
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
