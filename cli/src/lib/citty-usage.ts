import type { ArgsDef, CommandDef } from "citty";

function toArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

function camelCase(input: string): string {
  return input.replace(/-([a-z])/g, (_, character: string) => character.toUpperCase());
}

async function resolveValue<T>(input: T | (() => T) | (() => Promise<T>) | Promise<T>): Promise<T> {
  if (typeof input === "function") {
    return await (input as () => T | Promise<T>)();
  }
  return await input;
}

function isValueFlag(flag: string, argsDef: ArgsDef): boolean {
  const name = flag.replace(/^-{1,2}/, "");
  const normalized = camelCase(name);
  for (const [key, definition] of Object.entries(argsDef)) {
    if (definition.type !== "string" && definition.type !== "enum") {
      continue;
    }
    if (normalized === camelCase(key)) {
      return true;
    }
    const aliases = Array.isArray(definition.alias)
      ? definition.alias
      : definition.alias
        ? [definition.alias]
        : [];
    if (aliases.includes(name)) {
      return true;
    }
  }
  return false;
}

function findSubCommandIndex(rawArgs: string[], argsDef: ArgsDef): number {
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--") {
      return -1;
    }
    if (arg.startsWith("-")) {
      if (!arg.includes("=") && isValueFlag(arg, argsDef)) {
        index += 1;
      }
      continue;
    }
    return index;
  }
  return -1;
}

async function findSubCommand(
  subCommands: Record<
    string,
    CommandDef | (() => CommandDef) | (() => Promise<CommandDef>) | Promise<CommandDef>
  >,
  name: string | undefined,
): Promise<CommandDef | undefined> {
  if (!name) {
    return undefined;
  }
  if (name in subCommands) {
    return await resolveValue(subCommands[name]);
  }
  for (const subCommand of Object.values(subCommands)) {
    const resolved = await resolveValue(subCommand);
    const meta = await resolveValue(resolved.meta);
    if (meta?.alias && toArray(meta.alias).includes(name)) {
      return resolved;
    }
  }
  return undefined;
}

export async function resolveSubCommandForUsage(
  command: CommandDef,
  rawArgs: string[],
  parent?: CommandDef,
): Promise<[CommandDef, CommandDef | undefined]> {
  const subCommands = await resolveValue(command.subCommands);
  if (subCommands && Object.keys(subCommands).length > 0) {
    const subCommandArgIndex = findSubCommandIndex(rawArgs, await resolveValue(command.args ?? {}));
    const subCommandName = rawArgs[subCommandArgIndex];
    const subCommand = await findSubCommand(subCommands, subCommandName);
    if (subCommand) {
      return resolveSubCommandForUsage(subCommand, rawArgs.slice(subCommandArgIndex + 1), command);
    }
  }
  return [command, parent];
}
