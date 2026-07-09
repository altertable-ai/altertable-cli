import { renderUsage, type ArgsDef, type CommandDef } from "citty";
import type { AltertableCommandMeta } from "@/lib/command-context.ts";
import { tryFormatActiveContextSummary } from "@/features/profile/render.ts";
import { formatCommandExamplesSection } from "@/ui/terminal/styles.ts";

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

async function resolveCommandMeta(command: CommandDef): Promise<AltertableCommandMeta> {
  return (await resolveValue(command.meta ?? {})) as AltertableCommandMeta;
}

async function resolveCommandExamples(command: CommandDef): Promise<readonly string[]> {
  const meta = await resolveCommandMeta(command);
  return meta.examples ?? [];
}

async function isHiddenCommand(command: CommandDef): Promise<boolean> {
  const meta = await resolveCommandMeta(command);
  return meta.hidden === true;
}

async function commandForVisibleUsage(command: CommandDef): Promise<CommandDef> {
  const subCommands = await resolveValue(command.subCommands);
  if (!subCommands || Object.keys(subCommands).length === 0) {
    return command;
  }

  const visibleEntries: [string, CommandDef][] = [];
  for (const [name, subCommand] of Object.entries(subCommands)) {
    const resolved = await resolveValue(subCommand);
    if (!(await isHiddenCommand(resolved))) {
      visibleEntries.push([name, resolved]);
    }
  }

  return {
    ...command,
    subCommands: Object.fromEntries(visibleEntries),
  };
}

const ANSI_FOREGROUND_RESET = `${String.fromCharCode(27)}[39m`;

// Citty appends " (commandName)" to meta.description; the USAGE line already names the command.
function stripCittyDescriptionSuffix(usage: string): string {
  const firstNewline = usage.indexOf("\n");
  const firstLine = firstNewline === -1 ? usage : usage.slice(0, firstNewline);
  const rest = firstNewline === -1 ? "" : usage.slice(firstNewline);
  const hasColorReset = firstLine.endsWith(ANSI_FOREGROUND_RESET);
  const plainFirstLine = hasColorReset
    ? firstLine.slice(0, -ANSI_FOREGROUND_RESET.length)
    : firstLine;
  const strippedFirstLine = plainFirstLine.replace(/ \([^)]+\)$/, "");
  return `${strippedFirstLine}${hasColorReset ? ANSI_FOREGROUND_RESET : ""}${rest}`;
}

export async function renderAltertableUsage(
  command: CommandDef,
  parent?: CommandDef,
): Promise<string> {
  const usageCommand = await commandForVisibleUsage(command);
  const usage = stripCittyDescriptionSuffix(await renderUsage(usageCommand, parent));
  const examplesSection = formatCommandExamplesSection(await resolveCommandExamples(command));
  if (examplesSection.length === 0) {
    return usage;
  }
  return `${usage}${examplesSection}`;
}

export async function showAltertableUsage(command: CommandDef, parent?: CommandDef): Promise<void> {
  console.log(`${await renderAltertableUsage(command, parent)}\n`);
}

export async function showCommandExamplesForArgs(
  root: CommandDef,
  rawArgs: string[],
): Promise<void> {
  const [command] = await resolveSubCommandForUsage(root, rawArgs);
  const section = formatCommandExamplesSection(await resolveCommandExamples(command));
  if (section.length === 0) {
    return;
  }
  console.error(`${section.trimStart()}\n`);
}
