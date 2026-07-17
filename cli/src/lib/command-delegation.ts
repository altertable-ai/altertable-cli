import type { Command, CommandArgs } from "@/lib/command.ts";
import { resolveCommandMetadata } from "@/lib/command-descriptor.ts";

export type PositionalScanOptions = {
  valueFlags?: ReadonlySet<string>;
};

export type PositionalToken = {
  index: number;
  value: string;
};

export type SelectedSubCommand = {
  name: string;
  command: Command;
  operandIndex: number;
};

export type PassthroughCommandOptions = {
  commandName: string;
  rootArgs?: CommandArgs;
  commandValueFlags?: ReadonlySet<string>;
  isReservedOperand: (value: string) => boolean;
};

export function valueFlagsFor(args: CommandArgs): ReadonlySet<string> {
  const flags = new Set<string>();
  for (const [name, definition] of Object.entries(args)) {
    if (definition.type !== "string" && definition.type !== "enum") {
      continue;
    }

    flags.add(`--${name}`);
    const aliases = Array.isArray(definition.alias)
      ? definition.alias
      : definition.alias
        ? [definition.alias]
        : [];
    for (const alias of aliases) {
      flags.add(`-${alias}`);
    }
  }
  return flags;
}

export function findFirstPositionalToken(
  rawArgs: readonly string[],
  options: PositionalScanOptions = {},
): PositionalToken | undefined {
  const valueFlags = options.valueFlags ?? new Set<string>();

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--") {
      return undefined;
    }
    if (arg.startsWith("-")) {
      if (!arg.includes("=") && valueFlags.has(arg)) {
        index += 1;
      }
      continue;
    }
    return { index, value: arg };
  }
  return undefined;
}

async function resolveCommandValue<T>(
  value: T | (() => T) | (() => Promise<T>) | Promise<T>,
): Promise<T> {
  if (typeof value === "function") {
    return await (value as () => T | Promise<T>)();
  }
  return await value;
}

/**
 * Resolves the real child command selected by argv using the same operand rules
 * as Citty: skip value-bearing flags, stop at `--`, prefer command keys, then aliases.
 */
export async function resolveSelectedSubCommand(
  command: Command,
  rawArgs: readonly string[],
): Promise<SelectedSubCommand | undefined> {
  const args = await resolveCommandValue(command.args ?? {});
  const operand = findFirstPositionalToken(rawArgs, {
    valueFlags: valueFlagsFor(args),
  });
  if (!operand || !command.subCommands) return undefined;

  const subCommands = await resolveCommandValue(command.subCommands);
  const direct = subCommands[operand.value];
  if (direct) {
    return {
      name: operand.value,
      command: await resolveCommandValue(direct),
      operandIndex: operand.index,
    };
  }

  for (const [name, candidate] of Object.entries(subCommands)) {
    const resolved = await resolveCommandValue(candidate);
    const metadata = await resolveCommandMetadata(resolved);
    if (metadata.aliases.includes(operand.value)) {
      return { name, command: resolved, operandIndex: operand.index };
    }
  }

  return undefined;
}

export type DirectCommandOptions = {
  commandName: string;
  rootArgs?: CommandArgs;
  commandValueFlags?: ReadonlySet<string>;
  isReservedOperand: (value: string) => boolean;
};

/**
 * Keeps flags parser-visible while moving a direct operand behind `--`.
 * This lets a command own a positional operand and real subcommands without
 * representing its direct behavior as a synthetic default subcommand.
 */
export function normalizeDirectCommandRawArgs(
  rawArgs: readonly string[],
  options: DirectCommandOptions,
): string[] {
  const commandToken = findFirstPositionalToken(rawArgs, {
    valueFlags: valueFlagsFor(options.rootArgs ?? {}),
  });
  if (!commandToken || commandToken.value !== options.commandName) return [...rawArgs];

  const commandArgs = rawArgs.slice(commandToken.index + 1);
  if (commandArgs.includes("--")) return [...rawArgs];
  const operandToken = findFirstPositionalToken(commandArgs, {
    valueFlags: options.commandValueFlags,
  });
  if (!operandToken || options.isReservedOperand(operandToken.value)) return [...rawArgs];

  const normalized = [...rawArgs];
  const operandIndex = commandToken.index + 1 + operandToken.index;
  const [operand] = normalized.splice(operandIndex, 1);
  normalized.push("--", String(operand));
  return normalized;
}

export function normalizePassthroughCommandRawArgs(
  rawArgs: readonly string[],
  options: PassthroughCommandOptions,
): string[] {
  const commandToken = findFirstPositionalToken(rawArgs, {
    valueFlags: valueFlagsFor(options.rootArgs ?? {}),
  });
  if (!commandToken || commandToken.value !== options.commandName) {
    return [...rawArgs];
  }

  const commandArgs = rawArgs.slice(commandToken.index + 1);
  if (commandArgs.includes("--")) {
    return [...rawArgs];
  }

  const operandToken = findFirstPositionalToken(commandArgs, {
    valueFlags: options.commandValueFlags,
  });
  if (!operandToken || options.isReservedOperand(operandToken.value)) {
    return [...rawArgs];
  }

  const normalized = [...rawArgs];
  normalized.splice(commandToken.index + 1 + operandToken.index, 0, "--");
  return normalized;
}
