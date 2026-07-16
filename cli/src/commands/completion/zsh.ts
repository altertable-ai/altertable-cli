import type { CommandDef } from "citty";
import type { GetRootCommand } from "@/commands/completion/lib/completion.ts";
import {
  createInstallShellCommand,
  createShellCompletionCommand,
} from "@/commands/completion/lib/shell-command.ts";

export function createZshCompletionCommand(getRootCommand: GetRootCommand): CommandDef {
  return createShellCompletionCommand("zsh", getRootCommand);
}

export function createZshInstallCommand(getRootCommand: GetRootCommand): CommandDef {
  return createInstallShellCommand("zsh", getRootCommand);
}
