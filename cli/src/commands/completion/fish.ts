import type { CommandDef } from "citty";
import type { GetRootCommand } from "@/commands/completion/lib/completion.ts";
import {
  createInstallShellCommand,
  createShellCompletionCommand,
} from "@/commands/completion/lib/shell-command.ts";

export function createFishCompletionCommand(getRootCommand: GetRootCommand): CommandDef {
  return createShellCompletionCommand("fish", getRootCommand);
}

export function createFishInstallCommand(getRootCommand: GetRootCommand): CommandDef {
  return createInstallShellCommand("fish", getRootCommand);
}
