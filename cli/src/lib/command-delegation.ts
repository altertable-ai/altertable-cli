import type { CommandArgs } from "@/lib/command.ts";

export type PositionalScanOptions = {
  valueFlags?: ReadonlySet<string>;
};

export type PositionalToken = {
  index: number;
  value: string;
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

export function isDelegatedSubCommand(
  rawArgs: readonly string[],
  isReservedOperand: (value: string) => boolean,
  options: PositionalScanOptions = {},
): boolean {
  const token = findFirstPositionalToken(rawArgs, options);
  return token !== undefined && isReservedOperand(token.value);
}

export type DefaultSubCommandOptions = {
  commandName: string;
  subCommand: string;
  rootArgs?: CommandArgs;
  commandValueFlags?: ReadonlySet<string>;
  isReservedOperand: (value: string) => boolean;
};

/**
 * Rewrites `<command> <operand>` to `<command> <subCommand> <operand>` so citty routes a
 * bare operand to the default subcommand instead of rejecting it as an unknown command.
 * Reserved operands (real subcommand names) are left untouched. Unlike the `--` passthrough,
 * this keeps every flag citty-parsed regardless of where it sits relative to the operand.
 */
export function normalizeDefaultSubCommandRawArgs(
  rawArgs: readonly string[],
  options: DefaultSubCommandOptions,
): string[] {
  const commandToken = findFirstPositionalToken(rawArgs, {
    valueFlags: valueFlagsFor(options.rootArgs ?? {}),
  });
  if (!commandToken || commandToken.value !== options.commandName) {
    return [...rawArgs];
  }

  const commandArgs = rawArgs.slice(commandToken.index + 1);
  const operandToken = findFirstPositionalToken(commandArgs, {
    valueFlags: options.commandValueFlags,
  });
  if (!operandToken || options.isReservedOperand(operandToken.value)) {
    return [...rawArgs];
  }

  const normalized = [...rawArgs];
  normalized.splice(commandToken.index + 1, 0, options.subCommand);
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
