import type { ArgsDef } from "citty";

export type PositionalScanOptions = {
  valueFlags?: ReadonlySet<string>;
};

export type PositionalToken = {
  index: number;
  value: string;
};

export function valueFlagsFor(args: ArgsDef): ReadonlySet<string> {
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
  subCommandNames: ReadonlySet<string>,
  options: PositionalScanOptions = {},
): boolean {
  const token = findFirstPositionalToken(rawArgs, options);
  return token !== undefined && subCommandNames.has(token.value);
}
