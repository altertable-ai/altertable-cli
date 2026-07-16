import { appendRunArgs } from "@/commands/append/lib/args.ts";
import { parseAppendJsonContent } from "@/lib/lakehouse/args.ts";
import { buildLakehouseAppendRequest } from "@/lib/lakehouse-transport.ts";
import { booleanArg, stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { startProgress } from "@/lib/progress.ts";

export const appendRunCommand = defineCommand({
  meta: {
    name: "run",
    description: "Append JSON rows to a table.",
  },
  args: appendRunArgs,
  async run({ args, execution, sink }) {
    const sync = booleanArg(args, "sync");
    const request = buildLakehouseAppendRequest({
      catalog: stringArg(args, "catalog"),
      schema: stringArg(args, "schema"),
      table: stringArg(args, "table"),
      jsonContent: parseAppendJsonContent(stringArg(args, "data")),
      options: { sync },
    });
    const progress = sync ? startProgress("Waiting for append to complete…") : undefined;
    try {
      const response = await sendHttp(request, execution);
      progress?.done();
      await writeCommandOutput({ kind: "raw_api", body: response }, sink);
    } catch (error) {
      progress?.fail();
      throw error;
    }
  },
});
