import type { ArgsDef, CommandDef } from "citty";
import { findFirstPositionalToken, valueFlagsFor } from "@/lib/command-delegation.ts";

const HELP_FLAGS = new Set(["--help", "-h"]);

function resolveCommandArgs(command: CommandDef): ArgsDef {
  if (typeof command.args === "function") {
    return command.args() as ArgsDef;
  }
  return (command.args ?? {}) as ArgsDef;
}

function resolveSubCommands(command: CommandDef): Record<string, CommandDef> {
  if (typeof command.subCommands === "function") {
    return command.subCommands() as Record<string, CommandDef>;
  }
  return (command.subCommands ?? {}) as Record<string, CommandDef>;
}

function normalizeDefaultAtCommand(
  normalized: string[],
  command: CommandDef,
  offset: number,
): boolean {
  const subCommands = resolveSubCommands(command);
  if (Object.keys(subCommands).length === 0) {
    return false;
  }
  const defaultSubCommand = typeof command.default === "string" ? command.default : undefined;

  const commandArgs = normalized.slice(offset);
  if (commandArgs.includes("--") || commandArgs.some((arg) => HELP_FLAGS.has(arg))) {
    return false;
  }

  const token = findFirstPositionalToken(commandArgs, {
    valueFlags: valueFlagsFor(resolveCommandArgs(command)),
  });
  if (!token) {
    if (!defaultSubCommand) {
      return false;
    }
    normalized.splice(offset, 0, defaultSubCommand);
    return true;
  }

  const subCommand = subCommands[token.value];
  if (subCommand) {
    return normalizeDefaultAtCommand(normalized, subCommand, offset + token.index + 1);
  }

  if (!defaultSubCommand) {
    return false;
  }
  normalized.splice(offset, 0, defaultSubCommand);
  return true;
}

export function normalizeDefaultSubcommandRawArgs(
  rawArgs: readonly string[],
  rootCommand: CommandDef,
): string[] {
  const normalized = [...rawArgs];
  normalizeDefaultAtCommand(normalized, rootCommand, 0);
  return normalized;
}
