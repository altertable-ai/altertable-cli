import { enumArg, optionalStringArg, stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { parseLakehouseFileContentType, parseRequestReadTimeoutMs } from "@/lib/lakehouse/args.ts";
import { createLakehouseUploadRequest } from "@/lib/lakehouse-transport.ts";
import { getFileSizeBytes } from "@/lib/lakehouse/file.ts";
import { uploadArgs, UPLOAD_MODE_OPTIONS } from "@/commands/upload/lib/args.ts";

export const uploadCommand = defineCommand({
  meta: {
    name: "upload",
    commandGroup: "ingest",
    description: "Upload a file to create, append to, or overwrite a table.",
    examples: [
      "altertable upload --catalog db --schema public --table users --mode overwrite --format csv --file users.csv",
    ],
  },
  args: uploadArgs,
  async run({ args, execution, sink }) {
    const mode = enumArg(args, "mode", UPLOAD_MODE_OPTIONS);
    const filePath = stringArg(args, "file");
    const fileSizeBytes = getFileSizeBytes(filePath);

    const readTimeoutMs = parseRequestReadTimeoutMs(args);
    const scope = createLakehouseUploadRequest({
      catalog: stringArg(args, "catalog"),
      schema: stringArg(args, "schema"),
      table: stringArg(args, "table"),
      mode,
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
