import type { CommandDef } from "citty";
import { defineCommand } from "@/lib/command.ts";
import { createBashInstallCommand } from "@/commands/completion/bash.ts";
import { createFishInstallCommand } from "@/commands/completion/fish.ts";
import { createZshInstallCommand } from "@/commands/completion/zsh.ts";
import {
  formatCompletionScript,
  formatInstallMessage,
  installCompletion,
  isSupportedShell,
  resolveShell,
  type GetRootCommand,
} from "@/commands/completion/lib/completion.ts";

export function createInstallCommand(getRootCommand: GetRootCommand): CommandDef {
  return defineCommand({
    meta: {
      name: "install",
      description: "Install shell completion for the current shell.",
      examples: [
        "altertable completion install",
        "altertable completion install fish",
        "altertable completion install zsh --no-rc",
      ],
    },
    subCommands: {
      bash: createBashInstallCommand(getRootCommand),
      fish: createFishInstallCommand(getRootCommand),
      zsh: createZshInstallCommand(getRootCommand),
    },
    args: {
      "no-rc": {
        type: "boolean",
        description: "Write the completion file without updating shell startup files.",
      },
    },
    async run({ args, rawArgs, sink }) {
      const explicitShell = rawArgs.slice(rawArgs.indexOf("install") + 1).find(isSupportedShell);
      if (explicitShell) return;
      const shell = resolveShell(undefined);
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
