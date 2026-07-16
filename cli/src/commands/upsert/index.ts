import { optionalStringArg, stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { parseLakehouseFileContentType, parseRequestReadTimeoutMs } from "@/lib/lakehouse/args.ts";
import { getUploadFileSizeBytes, LAKEHOUSE_FILE_FORMAT_OPTIONS } from "@/commands/upload/index.ts";
import { createLakehouseUpsertRequest } from "@/lib/lakehouse-transport.ts";

export const upsertCommand = defineCommand({
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
  async run({ args, execution, sink }) {
    const filePath = stringArg(args, "file");
    const fileSizeBytes = getUploadFileSizeBytes(filePath);

    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const scope = createLakehouseUpsertRequest({
      catalog: stringArg(args, "catalog"),
      schema: stringArg(args, "schema"),
      table: stringArg(args, "table"),
      primaryKey: stringArg(args, "primary-key"),
      filePath,
      fileSizeBytes,
      contentType: parseLakehouseFileContentType(optionalStringArg(args, "format")),
      httpOptions: readTimeoutMs !== undefined ? { readTimeoutMs } : undefined,
    });
    try {
      const response = await sendHttp(scope.request, execution);
      await writeCommandOutput({ kind: "raw_api", body: response }, sink);
    } finally {
      scope.release();
    }
  },
});
