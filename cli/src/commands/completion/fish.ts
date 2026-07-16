import type { Command } from "@/lib/command.ts";
import type { GetRootCommand } from "@/commands/completion/lib/completion.ts";
import {
  createInstallShellCommand,
  createShellCompletionCommand,
} from "@/commands/completion/lib/shell-command.ts";

export function createFishCompletionCommand(getRootCommand: GetRootCommand): Command {
  return createShellCompletionCommand("fish", getRootCommand);
}

export function createFishInstallCommand(getRootCommand: GetRootCommand): Command {
  return createInstallShellCommand("fish", getRootCommand);
}
