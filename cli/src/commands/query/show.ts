import { stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { buildLakehouseQueryShowRequest } from "@/lib/lakehouse/query.ts";
import { sendHttp } from "@/lib/http-request.ts";

export const queryShowCommand = defineCommand({
  metadata: {
    name: "show",
    description: "Fetch metadata for a completed or running query.",
  },
  args: {
    "query-id": { type: "positional", description: "Query id returned by the API", required: true },
  },
  async run({ args, execution, sink }) {
    const response = await sendHttp(
      buildLakehouseQueryShowRequest(stringArg(args, "query-id")),
      execution,
    );
    await writeCommandOutput({ kind: "raw_api", body: response }, sink);
  },
});
