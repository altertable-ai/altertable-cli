import type { Command } from "@/lib/command.ts";
import type { GetRootCommand } from "@/commands/completion/lib/completion.ts";
import {
  createInstallShellCommand,
  createShellCompletionCommand,
} from "@/commands/completion/lib/shell-command.ts";

export function createBashCompletionCommand(getRootCommand: GetRootCommand): Command {
  return createShellCompletionCommand("bash", getRootCommand);
}

export function createBashInstallCommand(getRootCommand: GetRootCommand): Command {
  return createInstallShellCommand("bash", getRootCommand);
}
