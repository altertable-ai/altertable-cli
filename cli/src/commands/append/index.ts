import { booleanArg, stringArg } from "@/lib/args.ts";
import { defineCommand, type CommandArgs } from "@/lib/command.ts";
import { normalizeDirectCommandRawArgs, valueFlagsFor } from "@/lib/command-delegation.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { buildLakehouseAppendRequest } from "@/lib/lakehouse-transport.ts";
import { parseLakehouseTarget } from "@/lib/lakehouse/args.ts";
import { startProgress } from "@/lib/progress.ts";
import { appendStatusCommand } from "@/commands/append/status.ts";
import { appendGroupArgs } from "@/commands/append/lib/args.ts";
import { parseAppendJsonContent } from "@/commands/append/lib/data.ts";

export const appendCommand = defineCommand({
  meta: {
    name: "append",
    commandGroup: "ingest",
    description: "Append JSON rows to a table.",
    examples: [
      "altertable append '[{\"id\":1}]' --to db.public.events",
      "altertable append status <append-id>",
    ],
  },
  args: appendGroupArgs,
  subCommands: {
    status: appendStatusCommand,
  },
  async run({ args, rawArgs, execution, sink }) {
    if (rawArgs.includes("status")) return;
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

const APPEND_RESERVED_OPERANDS = new Set(["status", "run"]);
const APPEND_VALUE_FLAGS = valueFlagsFor(appendGroupArgs);

export function normalizeAppendInvocatorRawArgs(
  rawArgs: readonly string[],
  rootArgs: CommandArgs = {},
): string[] {
  return normalizeDirectCommandRawArgs(rawArgs, {
    commandName: "append",
    rootArgs,
    commandValueFlags: APPEND_VALUE_FLAGS,
    isReservedOperand: (value) => APPEND_RESERVED_OPERANDS.has(value),
  });
}
