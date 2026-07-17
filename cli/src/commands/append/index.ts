import { booleanArg, stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { buildLakehouseAppendRequest } from "@/lib/lakehouse-transport.ts";
import { parseLakehouseTarget } from "@/lib/lakehouse/args.ts";
import { startProgress } from "@/lib/progress.ts";
import { appendStatusCommand } from "@/commands/append/status.ts";
import { appendGroupArgs } from "@/commands/append/lib/args.ts";
import { parseAppendJsonContent } from "@/commands/append/lib/data.ts";

export const appendCommand = defineCommand({
  metadata: {
    name: "append",
    commandGroup: "ingest",
    description: "Append JSON rows to a table.",
    examples: [
      'altertable append \'{"event":"checkout_completed","user_id":"usr_123","revenue":99}\' --to analytics.main.events',
      "altertable append status <append-id>",
    ],
  },
  args: appendGroupArgs,
  subcommands: {
    status: appendStatusCommand,
  },
  async run({ args, execution, sink }) {
    const sync = booleanArg(args, "sync");
    const target = parseLakehouseTarget(stringArg(args, "to"));
    const request = buildLakehouseAppendRequest({
      ...target,
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
