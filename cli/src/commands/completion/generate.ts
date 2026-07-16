import type { CommandDef } from "citty";
import { defineCommand } from "@/lib/command.ts";
import { createBashCompletionCommand } from "@/commands/completion/bash.ts";
import { createFishCompletionCommand } from "@/commands/completion/fish.ts";
import { createZshCompletionCommand } from "@/commands/completion/zsh.ts";
import type { GetRootCommand } from "@/commands/completion/lib/completion.ts";

export function createGenerateCommand(getRootCommand: GetRootCommand): CommandDef {
  return defineCommand({
    meta: {
      name: "generate",
      description: "Generate a shell completion script.",
      examples: [
        "altertable completion generate bash",
        "altertable completion generate zsh > ~/.local/share/zsh/site-functions/_altertable",
      ],
    },
    subCommands: {
      bash: createBashCompletionCommand(getRootCommand),
      fish: createFishCompletionCommand(getRootCommand),
      zsh: createZshCompletionCommand(getRootCommand),
    },
  });
}
