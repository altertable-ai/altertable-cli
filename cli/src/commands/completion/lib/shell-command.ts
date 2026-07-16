import type { CommandDef } from "citty";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import {
  formatCompletionScript,
  formatInstallMessage,
  installCompletion,
  type GetRootCommand,
  type SupportedShell,
} from "@/commands/completion/lib/completion.ts";

export function createShellCompletionCommand(
  shell: SupportedShell,
  getRootCommand: GetRootCommand,
): CommandDef {
  return defineCommand({
    meta: { name: shell, description: `Generate ${shell} completion script.` },
    async run({ sink }) {
      await writeCommandOutput(
        { kind: "raw_api", body: formatCompletionScript(shell, getRootCommand()) },
        sink,
      );
    },
  });
}

export function createInstallShellCommand(
  shell: SupportedShell,
  getRootCommand: GetRootCommand,
): CommandDef {
  return defineCommand({
    meta: { name: shell, description: `Install ${shell} completion.` },
    args: {
      "no-rc": {
        type: "boolean",
        description: "Write the completion file without updating shell startup files.",
      },
    },
    async run({ args, rawArgs, sink }) {
      const result = await installCompletion(
        shell,
        formatCompletionScript(shell, getRootCommand()),
        { updateRc: args["no-rc"] !== true && !rawArgs.includes("--no-rc") },
      );
      if (sink.json) sink.writeJson(result);
      else sink.writeHuman(formatInstallMessage(result));
    },
  });
}
