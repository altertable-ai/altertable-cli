import { defineCommand } from "@/lib/command-context.ts";
import { appendRunCommand } from "@/commands/append/run.ts";
import { appendStatusCommand } from "@/commands/append/status.ts";
import { appendGroupArgs } from "@/commands/append/lib/args.ts";

export const appendCommand = defineCommand({
  meta: {
    name: "append",
    commandGroup: "ingest",
    description: "Append JSON rows to a table.",
    examples: [
      "altertable append --catalog db --schema public --table events --data '[{\"id\":1}]'",
      "altertable append status <append-id>",
    ],
  },
  default: "run",
  args: appendGroupArgs,
  subCommands: {
    run: appendRunCommand,
    status: appendStatusCommand,
  },
});
