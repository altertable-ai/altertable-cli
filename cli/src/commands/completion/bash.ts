import type { CommandDef } from "citty";
import type { GetRootCommand } from "@/commands/completion/lib/completion.ts";
import {
  createInstallShellCommand,
  createShellCompletionCommand,
} from "@/commands/completion/lib/shell-command.ts";

export function createBashCompletionCommand(getRootCommand: GetRootCommand): CommandDef {
  return createShellCompletionCommand("bash", getRootCommand);
}

export function createBashInstallCommand(getRootCommand: GetRootCommand): CommandDef {
  return createInstallShellCommand("bash", getRootCommand);
}
