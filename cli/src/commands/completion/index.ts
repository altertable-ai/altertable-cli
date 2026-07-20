import { defineCommand, type Command } from "@/lib/command.ts";
import { createGenerateCommand } from "@/commands/completion/generate.ts";
import { createInstallCommand } from "@/commands/completion/install.ts";
import {
  COMPLETION_GUIDANCE,
  formatCompletionHelpMessage,
  type GetRootCommand,
} from "@/commands/completion/lib/completion.ts";

export function createCompletionCommand(getRootCommand: GetRootCommand): Command {
  const command = defineCommand({
    metadata: {
      name: "completion",
      commandGroup: "platform",
      invocations: ["direct", "subcommand"],
      description: "Generate or install shell completion scripts.",
      examples: [
        "altertable completion install",
        "altertable completion install zsh",
        "altertable completion generate bash > ~/.local/share/bash-completion/completions/altertable",
      ],
    },
    subcommands: {
      generate: createGenerateCommand(getRootCommand),
      install: createInstallCommand(getRootCommand),
    },
    async run({ sink }) {
      if (sink.json) sink.writeJson(COMPLETION_GUIDANCE);
      else sink.writeHuman(formatCompletionHelpMessage());
    },
  });

  return command;
}
