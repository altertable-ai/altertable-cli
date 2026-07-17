import { stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { buildLakehouseQueryCancelRequest } from "@/lib/lakehouse/query.ts";
import { sendHttp } from "@/lib/http-request.ts";

export const queryCancelCommand = defineCommand({
  metadata: {
    name: "cancel",
    description: "Cancel a running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id to cancel", required: true },
    "session-id": { type: "string", description: "Session id that owns the query", required: true },
  },
  async run({ args, execution, sink }) {
    const response = await sendHttp(
      buildLakehouseQueryCancelRequest({
        queryId: stringArg(args, "query-id"),
        sessionId: stringArg(args, "session-id"),
      }),
      execution,
    );
    await writeCommandOutput({ kind: "raw_api", body: response }, sink);
  },
});
