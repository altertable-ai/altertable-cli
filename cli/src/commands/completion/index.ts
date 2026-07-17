import { defineCommand, type Command } from "@/lib/command.ts";
import { defaultPrompts } from "@/ui/prompts.ts";
import { createBashCompletionCommand } from "@/commands/completion/bash.ts";
import { createFishCompletionCommand } from "@/commands/completion/fish.ts";
import { createGenerateCommand } from "@/commands/completion/generate.ts";
import { createInstallCommand } from "@/commands/completion/install.ts";
import { createZshCompletionCommand } from "@/commands/completion/zsh.ts";
import {
  COMPLETION_GUIDANCE,
  formatCompletionHelpMessage,
  formatCompletionScript,
  formatInstallMessage,
  installCompletion,
  isSupportedShell,
  promptCompletionInput,
  resolveShell,
  type CompletionCommandOptions,
  type CompletionRootInput,
  type GetRootCommand,
} from "@/commands/completion/lib/completion.ts";

export function createCompletionCommand(
  getRootCommand: GetRootCommand,
  options: CompletionCommandOptions = {},
): Command {
  const prompts = options.prompts ?? defaultPrompts;
  return defineCommand({
    meta: {
      name: "completion",
      commandGroup: "platform",
      description: "Generate or install shell completion scripts.",
      examples: [
        "altertable completion install",
        "altertable completion install zsh",
        "altertable completion generate bash > ~/.local/share/bash-completion/completions/altertable",
      ],
    },
    subCommands: {
      bash: createBashCompletionCommand(getRootCommand),
      fish: createFishCompletionCommand(getRootCommand),
      generate: createGenerateCommand(getRootCommand),
      install: createInstallCommand(getRootCommand),
      zsh: createZshCompletionCommand(getRootCommand),
    },
    async run({ rawArgs, runtime, sink }) {
      if (rawArgs.some((arg) => arg === "install" || arg === "generate" || isSupportedShell(arg))) {
        return;
      }

      let action: CompletionRootInput;
      if (process.stdin.isTTY === true && !runtime.context.agent && !sink.json) {
        action = await promptCompletionInput(prompts);
      } else {
        action = { kind: "help" };
      }

      if (action.kind === "help") {
        if (sink.json) sink.writeJson(COMPLETION_GUIDANCE);
        else sink.writeHuman(formatCompletionHelpMessage());
        return;
      }

      const shell = action.shell ?? resolveShell(undefined);
      const result = await installCompletion(
        shell,
        formatCompletionScript(shell, getRootCommand()),
        { updateRc: action.updateRc },
      );
      if (sink.json) sink.writeJson(result);
      else sink.writeHuman(formatInstallMessage(result));
    },
  });
}
