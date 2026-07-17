import {
  commandArgumentValues,
  type Command,
  type CommandArg,
  type CommandArgs,
} from "@/lib/command.ts";
import type { AltertableCommandGroup } from "@/lib/command.ts";
import { resolveCommandMetadata, type CommandMetadata } from "@/lib/command-metadata.ts";
import { span, type DisplaySpan } from "@/ui/document.ts";
import { getVisibleTextWidth, renderDisplayText } from "@/ui/terminal/styles.ts";
import { HELP_FLAGS, VERSION_FLAGS } from "@/lib/early-bootstrap.ts";
import { readEnv } from "@/lib/env.ts";
import { getOutputSink } from "@/lib/runtime.ts";
import { resolveSelectedSubCommand } from "@/lib/command-delegation.ts";

const HELP_INDENT = "    ";
const HELP_COLUMN_GAP = "  ";
const HELP_MIN_DESCRIPTION_WIDTH = 16;
const HELP_FALLBACK_TERMINAL_WIDTH = 68;
const COMMAND_PATTERN = /altertable(?:\s+[^\s'",]+)*/g;
const COMMAND_GROUP_TITLES: Record<AltertableCommandGroup, string> = {
  platform: "Platform",
  ingest: "Ingest",
  query: "Query",
};

function renderHighlightedCommands(text: string): string {
  const spans: DisplaySpan[] = [];
  let offset = 0;
  for (const match of text.matchAll(COMMAND_PATTERN)) {
    const index = match.index ?? 0;
    spans.push(span(text.slice(offset, index)), span(match[0], "accent"));
    offset = index + match[0].length;
  }
  spans.push(span(text.slice(offset)));
  return renderDisplayText(spans);
}

function formatCommandExamplesSection(examples: readonly string[]): string {
  if (examples.length === 0) {
    return "";
  }
  const heading = renderDisplayText([span("EXAMPLES", "heading")]);
  return `\n\n${heading}\n\n${examples.map((example) => `  ${renderHighlightedCommands(example)}`).join("\n")}`;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

async function resolveValue<T>(input: T | (() => T) | (() => Promise<T>) | Promise<T>): Promise<T> {
  if (typeof input === "function") {
    return await (input as () => T | Promise<T>)();
  }
  return await input;
}

export async function resolveSubCommandForUsage(
  command: Command,
  rawArgs: string[],
  parent?: Command,
): Promise<[Command, Command | undefined]> {
  const selected = await resolveSelectedSubCommand(command, rawArgs);
  if (selected) {
    return resolveSubCommandForUsage(
      selected.command,
      rawArgs.slice(selected.operandIndex + 1),
      command,
    );
  }
  return [command, parent];
}

async function resolveCommandExamples(command: Command): Promise<readonly string[]> {
  return (await resolveCommandMetadata(command)).examples;
}

type VisibleSubCommand = {
  name: string;
  metadata: CommandMetadata;
};

async function visibleSubCommands(command: Command): Promise<VisibleSubCommand[]> {
  const subCommands = await resolveValue(command.subCommands);
  if (!subCommands || Object.keys(subCommands).length === 0) {
    return [];
  }

  const visibleEntries: VisibleSubCommand[] = [];
  for (const [name, subCommand] of Object.entries(subCommands)) {
    const resolved = await resolveValue(subCommand);
    const metadata = await resolveCommandMetadata(resolved);
    if (!metadata.hidden) {
      visibleEntries.push({ name, metadata });
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

  const environmentColumns = Number.parseInt(readEnv("COLUMNS") ?? "", 10);
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
        ...wrappedLabel.map((line) => `${HELP_INDENT}${renderDisplayText([span(line, "accent")])}`),
        ...wrappedDescription.map((line) => `${HELP_INDENT}${line}`),
      ];
    }

    return wrappedDescription.map((line, index) => {
      if (index === 0) {
        return `${HELP_INDENT}${renderDisplayText([span(label.padEnd(labelWidth), "accent")])}${HELP_COLUMN_GAP}${line}`;
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
    return renderDisplayText([
      span(line.slice(0, invocationStart)),
      span(invocation, "accent"),
      span(line.slice(invocationStart + invocation.length)),
    ]);
  });
}

function valueHint(name: string, definition: CommandArg): string | undefined {
  const values = commandArgumentValues(definition);
  if (values.length > 0) return definition.valueHint ?? values.join("|");
  if (definition.type === "string") {
    return definition.valueHint ?? name;
  }
  return undefined;
}

function flagLabel(name: string, definition: CommandArgs[string]): string {
  const aliases = ("alias" in definition ? toArray(definition.alias) : []).map(
    (alias) => `-${alias}`,
  );
  const longFlag = `--${name}`;
  const hint = valueHint(name, definition);
  const value = hint ? ` <${hint}>` : "";
  return [...aliases, `${longFlag}${value}`].join(", ");
}

function positionalLabel(name: string, definition: CommandArg): string {
  const values = commandArgumentValues(definition);
  return (definition.valueHint ?? (values.length > 0 ? values.join("|") : name)).toUpperCase();
}

function argumentDescription(definition: CommandArg): string {
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

function usageCommandName(metadata: CommandMetadata, parentMetadata?: CommandMetadata): string {
  const name = metadata.name ?? "command";
  if (!parentMetadata) {
    return name;
  }
  if (parentMetadata.name === "altertable") {
    return `altertable ${name}`;
  }
  return `altertable ${parentMetadata.name ?? "command"} ${name}`;
}

function usageTokens(
  commandName: string,
  args: CommandArgs,
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

async function renderCommandUsage(command: Command, parent?: Command): Promise<string> {
  const metadata = await resolveCommandMetadata(command);
  const parentMetadata = parent ? await resolveCommandMetadata(parent) : undefined;
  const args = await resolveValue(command.args ?? {});
  const subCommands = await visibleSubCommands(command);
  const commandName = usageCommandName(metadata, parentMetadata);
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
  const commandEntries = subCommands.map(({ name, metadata: subcommandMetadata }) => ({
    label: [name, ...subcommandMetadata.aliases].join(", "),
    description: subcommandMetadata.description,
  }));
  const lines = [
    ...(metadata.description ? wrapHelpText(metadata.description, getHelpTerminalWidth()) : []),
    "",
    `  ${renderDisplayText([span("Usage", "strong")])}`,
    `    ${usageTokens(commandName, args, subCommands)}`,
  ];

  if (positionalEntries.length > 0) {
    lines.push(
      "",
      `  ${renderDisplayText([span("Arguments", "strong")])}`,
      ...formatHelpEntries(positionalEntries),
    );
  }
  if (optionEntries.length > 0) {
    lines.push(
      "",
      `  ${renderDisplayText([span("Options", "strong")])}`,
      ...formatHelpEntries(optionEntries),
    );
  }
  if (commandEntries.length > 0) {
    lines.push(
      "",
      `  ${renderDisplayText([span("Commands", "strong")])}`,
      ...formatHelpEntries(commandEntries),
    );
    lines.push("", ...formatHelpGuidance(commandName));
  }

  const examples = await resolveCommandExamples(command);
  if (examples.length > 0) {
    lines.push(
      "",
      `  ${renderDisplayText([span("Examples", "strong")])}`,
      ...examples.flatMap((example) =>
        formatHelpParagraph(example, HELP_INDENT).map(renderHighlightedCommands),
      ),
    );
  }

  return lines.join("\n");
}

async function renderRootUsage(command: Command, metadata: CommandMetadata): Promise<string> {
  const args = await resolveValue(command.args ?? {});
  const groupedEntries: Record<AltertableCommandGroup, HelpEntry[]> = {
    platform: [],
    ingest: [],
    query: [],
  };
  const lines = [
    ...wrapHelpText(metadata.description, getHelpTerminalWidth()),
    "",
    `  ${renderDisplayText([span("Usage", "strong")])}`,
    "    altertable <command> [flags]",
    "",
    `  ${renderDisplayText([span("Commands", "strong")])}`,
  ];

  for (const { name, metadata: commandMetadata } of await visibleSubCommands(command)) {
    if (!commandMetadata.commandGroup) {
      continue;
    }
    groupedEntries[commandMetadata.commandGroup].push({
      label: name,
      description: commandMetadata.description,
    });
  }

  let renderedGroup = false;
  for (const [group, entries] of Object.entries(groupedEntries) as Array<
    [AltertableCommandGroup, HelpEntry[]]
  >) {
    if (entries.length > 0) {
      lines.push(
        ...(renderedGroup ? [""] : []),
        `    ${renderDisplayText([span(COMMAND_GROUP_TITLES[group], "muted")])}`,
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
  lines.push(
    "",
    `  ${renderDisplayText([span("Global flags", "strong")])}`,
    ...formatHelpEntries(flags),
  );

  const examples = await resolveCommandExamples(command);
  if (examples.length > 0) {
    lines.push(
      "",
      `  ${renderDisplayText([span("Examples", "strong")])}`,
      ...examples.flatMap((example) =>
        formatHelpParagraph(example, HELP_INDENT).map(renderHighlightedCommands),
      ),
    );
  }

  return lines.join("\n");
}

export async function renderAltertableUsage(command: Command, parent?: Command): Promise<string> {
  const metadata = await resolveCommandMetadata(command);
  if (parent === undefined && metadata.name === "altertable") {
    return renderRootUsage(command, metadata);
  }

  return renderCommandUsage(command, parent);
}

type StructuredArgument = {
  name: string;
  aliases: string[];
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
  values?: string[];
};

export type StructuredHelp = {
  command: string;
  description: string;
  usage: string;
  aliases: string[];
  arguments: StructuredArgument[];
  options: StructuredArgument[];
  subcommands: Array<{ name: string; aliases: string[]; description: string }>;
  global_options: StructuredArgument[];
  examples: string[];
};

function structuredArgument(name: string, definition: CommandArg): StructuredArgument {
  const aliases =
    "alias" in definition ? toArray(definition.alias).map((alias) => String(alias)) : [];
  const required =
    definition.default === undefined &&
    (definition.type === "positional"
      ? definition.required !== false
      : definition.required === true);
  const values = commandArgumentValues(definition);
  return {
    name,
    aliases,
    type: definition.type ?? "string",
    required,
    description: definition.description ?? "",
    ...(definition.default !== undefined ? { default: definition.default } : {}),
    ...(values.length > 0 ? { values: [...values] } : {}),
  };
}

export async function buildStructuredHelp(
  command: Command,
  parent?: Command,
  root?: Command,
): Promise<StructuredHelp> {
  const metadata = await resolveCommandMetadata(command);
  const parentMetadata = parent ? await resolveCommandMetadata(parent) : undefined;
  const args = await resolveValue(command.args ?? {});
  const subCommands = await visibleSubCommands(command);
  const commandName = usageCommandName(metadata, parentMetadata);
  const isRootCommand = parent === undefined && metadata.name === "altertable";
  const usage = isRootCommand
    ? "altertable <command> [flags]"
    : usageTokens(commandName, args, subCommands);
  const entries = Object.entries(args).map(([name, definition]) =>
    structuredArgument(name, definition),
  );
  const globalArgs = root ? await resolveValue(root.args ?? {}) : {};

  return {
    command: commandName,
    description: metadata.description,
    usage,
    aliases: metadata.aliases,
    arguments: entries.filter((entry) => entry.type === "positional"),
    options: isRootCommand ? [] : entries.filter((entry) => entry.type !== "positional"),
    subcommands: subCommands.map(({ name, metadata: subcommandMetadata }) => ({
      name,
      aliases: subcommandMetadata.aliases,
      description: subcommandMetadata.description,
    })),
    global_options: Object.entries(globalArgs).map(([name, definition]) =>
      structuredArgument(name, definition),
    ),
    examples: metadata.examples,
  };
}

export async function showAltertableUsage(
  command: Command,
  parent?: Command,
  root?: Command,
): Promise<void> {
  const sink = getOutputSink();
  if (sink.json) {
    sink.writeJson(await buildStructuredHelp(command, parent, root));
    return;
  }
  sink.writeHuman(`${await renderAltertableUsage(command, parent)}\n`);
}

export async function showCommandExamplesForArgs(root: Command, rawArgs: string[]): Promise<void> {
  const [command] = await resolveSubCommandForUsage(root, rawArgs);
  const section = formatCommandExamplesSection(await resolveCommandExamples(command));
  if (section.length === 0) {
    return;
  }
  console.error(`${section.trimStart()}\n`);
}
