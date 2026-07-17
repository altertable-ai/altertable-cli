import { enumArg, optionalStringArg, stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { parseLakehouseFileContentType, parseLakehouseTarget } from "@/lib/lakehouse/args.ts";
import { createLakehouseUploadRequest } from "@/lib/lakehouse-transport.ts";
import { getFileSizeBytes } from "@/lib/lakehouse/file.ts";
import { uploadArgs, UPLOAD_MODE_OPTIONS } from "@/commands/upload/lib/args.ts";

export const uploadCommand = defineCommand({
  meta: {
    name: "upload",
    commandGroup: "ingest",
    description: "Upload a file to create, append to, or overwrite a table.",
    examples: [
      "altertable upload users.csv --to analytics.main.users",
      "altertable upload orders.parquet --to analytics.main.orders --mode overwrite",
    ],
  },
  args: uploadArgs,
  async run({ args, execution, sink }) {
    const mode = enumArg(args, "mode", UPLOAD_MODE_OPTIONS);
    const filePath = stringArg(args, "file");
    const fileSizeBytes = getFileSizeBytes(filePath);
    const target = parseLakehouseTarget(stringArg(args, "to"));

    const scope = createLakehouseUploadRequest({
      ...target,
      mode,
      filePath,
      fileSizeBytes,
      contentType: parseLakehouseFileContentType(optionalStringArg(args, "format"), filePath),
    });
    try {
      const response = await sendHttp(scope.request, execution);
      await writeCommandOutput({ kind: "raw_api", body: response }, sink);
    } finally {
      scope.release();
    }
  },
});
