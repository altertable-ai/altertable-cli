import { optionalStringArg, stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { parseLakehouseFileContentType } from "@/lib/lakehouse/args.ts";
import { parseRequestReadTimeoutMs } from "@/lib/timeout-args.ts";
import { getFileSizeBytes } from "@/lib/lakehouse/file.ts";
import { createLakehouseUpsertRequest } from "@/lib/lakehouse-transport.ts";
import { upsertArgs } from "@/commands/upsert/lib/args.ts";

export const upsertCommand = defineCommand({
  meta: {
    name: "upsert",
    commandGroup: "ingest",
    description: "Upload a file and match existing rows by primary key.",
    examples: [
      "altertable upsert --catalog db --schema public --table users --primary-key id --format csv --file users.csv",
    ],
  },
  args: upsertArgs,
  async run({ args, execution, sink }) {
    const filePath = stringArg(args, "file");
    const fileSizeBytes = getFileSizeBytes(filePath);

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
