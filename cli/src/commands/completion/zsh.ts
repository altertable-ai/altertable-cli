import type { Command } from "@/lib/command.ts";
import type { GetRootCommand } from "@/commands/completion/lib/completion.ts";
import {
  createInstallShellCommand,
  createShellCompletionCommand,
} from "@/commands/completion/lib/shell-command.ts";

export function createZshCompletionCommand(getRootCommand: GetRootCommand): Command {
  return createShellCompletionCommand("zsh", getRootCommand);
}

export function createZshInstallCommand(getRootCommand: GetRootCommand): Command {
  return createInstallShellCommand("zsh", getRootCommand);
}
