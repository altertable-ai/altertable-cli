import { defineCommand, type Command } from "@/lib/command.ts";
import { optionalStringArg } from "@/lib/args.ts";
import {
  formatCompletionScript,
  formatInstallMessage,
  installCompletion,
  resolveShell,
  SUPPORTED_SHELLS,
  type GetRootCommand,
} from "@/commands/completion/lib/completion.ts";

export function createInstallCommand(getRootCommand: GetRootCommand): Command {
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
    args: {
      shell: {
        type: "positional",
        description: "Shell to install completion for (default: detected shell)",
        required: false,
        values: SUPPORTED_SHELLS,
      },
      "no-rc": {
        type: "boolean",
        description: "Write the completion file without updating shell startup files.",
      },
    },
    async run({ args, rawArgs, sink }) {
      const shell = resolveShell(optionalStringArg(args, "shell"));
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
