import { defineCommand, type Command } from "@/lib/command.ts";
import { stringArg } from "@/lib/args.ts";
import {
  formatCompletionScript,
  resolveShell,
  SUPPORTED_SHELLS,
  type GetRootCommand,
} from "@/commands/completion/lib/completion.ts";

export function createGenerateCommand(getRootCommand: GetRootCommand): Command {
  return defineCommand({
    meta: {
      name: "generate",
      description: "Generate a shell completion script.",
      examples: [
        "altertable completion generate bash",
        "altertable completion generate zsh > ~/.local/share/zsh/site-functions/_altertable",
      ],
    },
    args: {
      shell: {
        type: "positional",
        description: "Shell to generate completion for",
        required: true,
        values: SUPPORTED_SHELLS,
      },
    },
    async run({ args, sink }) {
      const shell = resolveShell(stringArg(args, "shell"));
      sink.writeRaw(await formatCompletionScript(shell, getRootCommand()));
    },
  });
}
