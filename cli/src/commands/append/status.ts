import { stringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";

export const appendStatusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Fetch status for an append operation.",
  },
  args: {
    "append-id": {
      type: "positional",
      description: "Append id returned by append",
      required: true,
    },
  },
  async run({ args, execution, sink }) {
    const response = await sendHttp(
      {
        plane: "lakehouse",
        method: "GET",
        endpoint: `/tasks/${encodeURIComponent(stringArg(args, "append-id"))}`,
        retry: true,
      },
      execution,
    );
    await writeCommandOutput({ kind: "raw_api", body: response }, sink);
  },
});
