import { defineCommand, type Command } from "@/lib/command.ts";
import { createGenerateCommand } from "@/commands/completion/generate.ts";
import { createInstallCommand } from "@/commands/completion/install.ts";
import {
  COMPLETION_GUIDANCE,
  formatCompletionHelpMessage,
  type GetRootCommand,
} from "@/commands/completion/lib/completion.ts";

export function createCompletionCommand(getRootCommand: GetRootCommand): Command {
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
      generate: createGenerateCommand(getRootCommand),
      install: createInstallCommand(getRootCommand),
    },
    run({ rawArgs, sink }) {
      if (rawArgs.some((arg) => arg === "install" || arg === "generate")) {
        return;
      }
      if (sink.json) sink.writeJson(COMPLETION_GUIDANCE);
      else sink.writeHuman(formatCompletionHelpMessage());
    },
  });
}
