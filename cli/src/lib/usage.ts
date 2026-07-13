import type { ArgDef, ArgsDef, CommandDef } from "citty";
import type { AltertableCommandGroup, AltertableCommandMeta } from "@/lib/command-context.ts";
import {
  formatCommandExamplesSection,
  getVisibleTextWidth,
  terminalAccent,
  terminalHighlightCommands,
  terminalMuted,
  terminalStrong,
} from "@/ui/terminal/styles.ts";
import { HELP_FLAGS, VERSION_FLAGS } from "@/lib/early-bootstrap.ts";
import { readEnv } from "@/lib/env.ts";

const HELP_INDENT = "    ";
const HELP_COLUMN_GAP = "  ";
const HELP_MIN_DESCRIPTION_WIDTH = 16;
const HELP_FALLBACK_TERMINAL_WIDTH = 68;
const COMMAND_GROUP_TITLES: Record<AltertableCommandGroup, string> = {
  platform: "Platform",
  ingest: "Ingest",
  query: "Query",
};

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

type VisibleSubCommand = {
  name: string;
  meta: AltertableCommandMeta;
};

async function visibleSubCommands(command: CommandDef): Promise<VisibleSubCommand[]> {
  const subCommands = await resolveValue(command.subCommands);
  if (!subCommands || Object.keys(subCommands).length === 0) {
    return [];
  }

  const visibleEntries: VisibleSubCommand[] = [];
  for (const [name, subCommand] of Object.entries(subCommands)) {
    const resolved = await resolveValue(subCommand);
    const meta = await resolveCommandMeta(resolved);
    if (!meta.hidden) {
      visibleEntries.push({ name, meta });
    }
  }

  return visibleEntries;
}

type HelpEntry = {
  label: string;
  description: string;
};

function wrapHelpText(text: string, maxWidth: number): string[] {
  maxWidth = Math.max(1, maxWidth);
  const normalizedText = text.trim().replace(/\s+/g, " ");
  if (normalizedText.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = "";
  for (const word of normalizedText.split(" ")) {
    if (getVisibleTextWidth(word) > maxWidth) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = "";
      }
      let remainingWord = word;
      while (getVisibleTextWidth(remainingWord) > maxWidth) {
        let splitAt = maxWidth;
        while (splitAt > 1 && getVisibleTextWidth(remainingWord.slice(0, splitAt)) > maxWidth) {
          splitAt -= 1;
        }
        lines.push(remainingWord.slice(0, splitAt));
        remainingWord = remainingWord.slice(splitAt);
      }
      currentLine = remainingWord;
      continue;
    }

    const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (currentLine.length > 0 && getVisibleTextWidth(candidate) > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
}

function getHelpTerminalWidth(): number {
  const columns = globalThis.process?.stdout?.columns;
  if (typeof columns === "number" && columns > 0) {
    return columns;
  }

  const environmentColumns = Number.parseInt(readEnv("columns") ?? "", 10);
  return Number.isFinite(environmentColumns) && environmentColumns > 0
    ? environmentColumns
    : HELP_FALLBACK_TERMINAL_WIDTH;
}

function formatHelpEntries(entries: readonly HelpEntry[]): string[] {
  const labelWidth = Math.max(...entries.map((entry) => getVisibleTextWidth(entry.label)), 0);
  const descriptionColumn = HELP_INDENT.length + labelWidth + HELP_COLUMN_GAP.length;
  const terminalWidth = getHelpTerminalWidth();
  const descriptionWidth = terminalWidth - descriptionColumn;
  const stacked = descriptionWidth < HELP_MIN_DESCRIPTION_WIDTH;

  return entries.flatMap(({ label, description }) => {
    const availableWidth = Math.max(
      1,
      stacked ? terminalWidth - HELP_INDENT.length : descriptionWidth,
    );
    const wrappedDescription = wrapHelpText(description, availableWidth);
    if (stacked) {
      const wrappedLabel = wrapHelpText(label, availableWidth);
      return [
        ...wrappedLabel.map((line) => `${HELP_INDENT}${terminalAccent(line)}`),
        ...wrappedDescription.map((line) => `${HELP_INDENT}${line}`),
      ];
    }

    return wrappedDescription.map((line, index) => {
      if (index === 0) {
        return `${HELP_INDENT}${terminalAccent(label.padEnd(labelWidth))}${HELP_COLUMN_GAP}${line}`;
      }
      return `${" ".repeat(descriptionColumn)}${line}`;
    });
  });
}

function formatHelpParagraph(text: string, indent: string): string[] {
  const width = Math.max(1, getHelpTerminalWidth() - indent.length);
  return wrapHelpText(text, width).map((line) => `${indent}${line}`);
}

function formatHelpGuidance(commandName: string): string[] {
  const invocation = `${commandName} <command> --help`;
  const guidance = `Use ${invocation} for more information about a command.`;
  return formatHelpParagraph(guidance, HELP_INDENT).map((line) => {
    const invocationStart = line.indexOf(invocation);
    if (invocationStart === -1) {
      return line;
    }
    return `${line.slice(0, invocationStart)}${terminalAccent(invocation)}${line.slice(invocationStart + invocation.length)}`;
  });
}

function valueHint(name: string, definition: ArgDef): string | undefined {
  if (definition.type === "enum" && definition.options?.length) {
    return definition.valueHint ?? definition.options.join("|");
  }
  if (definition.type === "string") {
    return definition.valueHint ?? name;
  }
  return undefined;
}

function flagLabel(name: string, definition: ArgsDef[string]): string {
  const aliases = ("alias" in definition ? toArray(definition.alias) : []).map(
    (alias) => `-${alias}`,
  );
  const longFlag = `--${name}`;
  const hint = valueHint(name, definition);
  const value = hint ? ` <${hint}>` : "";
  return [...aliases, `${longFlag}${value}`].join(", ");
}

function positionalLabel(name: string, definition: ArgDef): string {
  return (definition.valueHint ?? name).toUpperCase();
}

function argumentDescription(definition: ArgDef): string {
  const required =
    definition.default === undefined &&
    (definition.type === "positional"
      ? definition.required !== false
      : definition.required === true);
  const defaultValue =
    definition.default === undefined ? undefined : `(Default: ${definition.default})`;
  return [definition.description, required ? "(Required)" : undefined, defaultValue]
    .filter((part): part is string => part !== undefined)
    .join(" ");
}

function usageCommandName(meta: AltertableCommandMeta, parentMeta?: AltertableCommandMeta): string {
  const name = meta.name ?? "command";
  if (!parentMeta) {
    return name;
  }
  if (parentMeta.name === "altertable") {
    return `altertable ${name}`;
  }
  return `altertable ${parentMeta.name ?? "command"} ${name}`;
}

function usageTokens(
  commandName: string,
  args: ArgsDef,
  subCommands: readonly VisibleSubCommand[],
): string {
  const positionalArgs = Object.entries(args)
    .filter(([, definition]) => definition.type === "positional")
    .map(([name, definition]) => {
      const label = positionalLabel(name, definition);
      const required = definition.required !== false && definition.default === undefined;
      return required ? `<${label}>` : `[${label}]`;
    });
  const hasOptions = Object.values(args).some((definition) => definition.type !== "positional");
  const commandNames = subCommands.map(({ name }) => name).join("|");
  return [
    commandName,
    hasOptions ? "[flags]" : undefined,
    ...positionalArgs,
    commandNames || undefined,
  ]
    .filter((token): token is string => token !== undefined)
    .join(" ");
}

async function renderCommandUsage(command: CommandDef, parent?: CommandDef): Promise<string> {
  const meta = await resolveCommandMeta(command);
  const parentMeta = parent ? await resolveCommandMeta(parent) : undefined;
  const args = await resolveValue(command.args ?? {});
  const subCommands = await visibleSubCommands(command);
  const commandName = usageCommandName(meta, parentMeta);
  const positionalEntries = Object.entries(args)
    .filter(([, definition]) => definition.type === "positional")
    .map(([name, definition]) => ({
      label: positionalLabel(name, definition),
      description: argumentDescription(definition),
    }));
  const optionEntries = Object.entries(args)
    .filter(([, definition]) => definition.type !== "positional")
    .map(([name, definition]) => ({
      label: flagLabel(name, definition),
      description: argumentDescription(definition),
    }));
  const commandEntries = subCommands.map(({ name, meta: subCommandMeta }) => ({
    label: [name, ...toArray(subCommandMeta.alias)].join(", "),
    description: subCommandMeta.description ?? "",
  }));
  const lines = [
    ...(meta.description ? wrapHelpText(meta.description, getHelpTerminalWidth()) : []),
    "",
    `  ${terminalStrong("Usage")}`,
    `    ${usageTokens(commandName, args, subCommands)}`,
  ];

  if (positionalEntries.length > 0) {
    lines.push("", `  ${terminalStrong("Arguments")}`, ...formatHelpEntries(positionalEntries));
  }
  if (optionEntries.length > 0) {
    lines.push("", `  ${terminalStrong("Options")}`, ...formatHelpEntries(optionEntries));
  }
  if (commandEntries.length > 0) {
    lines.push("", `  ${terminalStrong("Commands")}`, ...formatHelpEntries(commandEntries));
    lines.push("", ...formatHelpGuidance(commandName));
  }

  const examples = await resolveCommandExamples(command);
  if (examples.length > 0) {
    lines.push(
      "",
      `  ${terminalStrong("Examples")}`,
      ...examples.flatMap((example) =>
        formatHelpParagraph(example, HELP_INDENT).map(terminalHighlightCommands),
      ),
    );
  }

  return lines.join("\n");
}

async function renderRootUsage(command: CommandDef, meta: AltertableCommandMeta): Promise<string> {
  const args = await resolveValue(command.args ?? {});
  const groupedEntries: Record<AltertableCommandGroup, HelpEntry[]> = {
    platform: [],
    ingest: [],
    query: [],
  };
  const lines = [
    ...wrapHelpText(meta.description ?? "", getHelpTerminalWidth()),
    "",
    `  ${terminalStrong("Usage")}`,
    "    altertable <command> [flags]",
    "",
    `  ${terminalStrong("Commands")}`,
  ];

  for (const { name, meta: commandMeta } of await visibleSubCommands(command)) {
    if (!commandMeta.commandGroup) {
      continue;
    }
    groupedEntries[commandMeta.commandGroup].push({
      label: name,
      description: commandMeta.description ?? "",
    });
  }

  let renderedGroup = false;
  for (const [group, entries] of Object.entries(groupedEntries) as Array<
    [AltertableCommandGroup, HelpEntry[]]
  >) {
    if (entries.length > 0) {
      lines.push(
        ...(renderedGroup ? [""] : []),
        `    ${terminalMuted(COMMAND_GROUP_TITLES[group])}`,
        ...formatHelpEntries(entries),
      );
      renderedGroup = true;
    }
  }

  lines.push("", ...formatHelpGuidance("altertable"));

  const flags = Object.entries(args).map(([name, definition]) => ({
    label: flagLabel(name, definition),
    description: definition.description ?? "",
  }));
  flags.push(
    { label: HELP_FLAGS.join(", "), description: "Show this help" },
    { label: VERSION_FLAGS.join(", "), description: "Show the Altertable CLI version" },
  );
  lines.push("", `  ${terminalStrong("Global flags")}`, ...formatHelpEntries(flags));

  const examples = await resolveCommandExamples(command);
  if (examples.length > 0) {
    lines.push(
      "",
      `  ${terminalStrong("Examples")}`,
      ...examples.flatMap((example) =>
        formatHelpParagraph(example, HELP_INDENT).map(terminalHighlightCommands),
      ),
    );
  }

  return lines.join("\n");
}

export async function renderAltertableUsage(
  command: CommandDef,
  parent?: CommandDef,
): Promise<string> {
  const meta = await resolveCommandMeta(command);
  if (parent === undefined && meta.name === "altertable") {
    return renderRootUsage(command, meta);
  }

  return renderCommandUsage(command, parent);
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
