import { statSync } from "node:fs";
import { CliError } from "@/lib/errors.ts";
import { enumArg, optionalStringArg, stringArg } from "@/lib/operation-codec.ts";
import { httpEffect, scopedPlan } from "@/lib/operation-effect.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import {
  parseLakehouseFileContentType,
  parseRequestReadTimeoutMs,
} from "@/lib/lakehouse/args.ts";
import { createLakehouseUploadRequest } from "@/lib/lakehouse-transport.ts";

export const LAKEHOUSE_FILE_FORMAT_OPTIONS = ["csv", "json", "parquet"] as const;
const UPLOAD_MODE_OPTIONS = ["create", "append", "overwrite"] as const;

export function getUploadFileSizeBytes(filePath: string): number {
  try {
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) {
      throw new CliError(`File not found: ${filePath}`);
    }
    return fileStat.size;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(`File not found: ${filePath}`);
  }
}

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
    commandGroup: "ingest",
    description: "Upload a file to create, append to, or overwrite a table.",
    examples: [
      "altertable upload --catalog db --schema public --table users --mode overwrite --format csv --file users.csv",
    ],
  },
  args: {
    catalog: { type: "string", required: true },
    schema: { type: "string", required: true },
    table: { type: "string", required: true },
    mode: {
      type: "enum",
      description: "create, append, or overwrite",
      required: true,
      options: [...UPLOAD_MODE_OPTIONS],
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
    const mode = enumArg(args, "mode", UPLOAD_MODE_OPTIONS);
    const filePath = stringArg(args, "file");
    const fileSizeBytes = getUploadFileSizeBytes(filePath);

    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    return {
      catalog: stringArg(args, "catalog"),
      schema: stringArg(args, "schema"),
      table: stringArg(args, "table"),
      mode,
      filePath,
      fileSizeBytes,
      contentType: parseLakehouseFileContentType(optionalStringArg(args, "format")),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    };
  },
  run(input) {
    return scopedPlan(() => {
      const scope = createLakehouseUploadRequest({
        catalog: input.catalog,
        schema: input.schema,
        table: input.table,
        mode: input.mode,
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
