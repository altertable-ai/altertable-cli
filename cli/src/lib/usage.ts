import type { Command } from "@/lib/command.ts";
import type { AltertableCommandGroup } from "@/lib/command.ts";
import {
  resolveCommandDescriptor,
  visibleCommandDescriptors,
  type CommandArgumentDescriptor,
  type CommandDescriptor,
  type ResolvedCommandMetadata,
} from "@/lib/command-descriptor.ts";
import { span, type DisplaySpan } from "@/ui/document.ts";
import { getVisibleTextWidth, renderDisplayText } from "@/ui/terminal/styles.ts";
import { readEnv } from "@/lib/env.ts";
import { getOutputSink } from "@/lib/runtime.ts";
import { resolveCommandSelection } from "@/lib/command-parser.ts";

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

export async function resolveSubCommandForUsage(
  command: Command,
  rawArgs: string[],
): Promise<[Command, Command | undefined]> {
  const selected = await resolveCommandSelection(command, rawArgs);
  return [selected.command, selected.parent];
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

function valueHint(argument: CommandArgumentDescriptor): string | undefined {
  if (argument.values.length > 0) return argument.valueHint ?? argument.values.join("|");
  if (argument.type === "string") {
    return argument.valueHint ?? argument.name;
  }
  return undefined;
}

function flagLabel(argument: CommandArgumentDescriptor): string {
  const aliases = argument.aliases.map((alias) => `-${alias}`);
  const longFlag = `--${argument.name}`;
  const hint = valueHint(argument);
  const value = hint ? ` <${hint}>` : "";
  return [...aliases, `${longFlag}${value}`].join(", ");
}

function positionalLabel(argument: CommandArgumentDescriptor): string {
  return (
    argument.valueHint ?? (argument.values.length > 0 ? argument.values.join("|") : argument.name)
  ).toUpperCase();
}

function formatDefaultValue(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    default:
      return JSON.stringify(value) ?? "";
  }
}

function argumentDescription(argument: CommandArgumentDescriptor): string {
  const defaultValue =
    argument.default === undefined
      ? undefined
      : `(Default: ${formatDefaultValue(argument.default)})`;
  return [
    argument.description,
    argument.required ? "(Required)" : undefined,
    argument.repeatable ? "(Repeatable)" : undefined,
    defaultValue,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ");
}

function usageCommandName(
  metadata: ResolvedCommandMetadata,
  parentMetadata?: ResolvedCommandMetadata,
): string {
  const name = metadata.name ?? "command";
  if (!parentMetadata) {
    return name;
  }
  if (parentMetadata.name === "altertable") {
    return `altertable ${name}`;
  }
  return `altertable ${parentMetadata.name ?? "command"} ${name}`;
}

function usageVariants(commandName: string, descriptor: CommandDescriptor): string[] {
  const positionalArgs = descriptor.arguments
    .filter((argument) => argument.type === "positional")
    .map((argument) => {
      const label = positionalLabel(argument);
      return argument.required ? `<${label}>` : `[${label}]`;
    });
  const hasOptions = descriptor.arguments.some((argument) => argument.type !== "positional");
  const commandNames = visibleCommandDescriptors(descriptor.subcommands)
    .map(({ key, metadata }) => key ?? metadata.name)
    .join("|");
  const variants: string[] = [];

  if (descriptor.metadata.invocations.includes("direct")) {
    variants.push(
      [commandName, hasOptions ? "[flags]" : undefined, ...positionalArgs]
        .filter((token): token is string => token !== undefined)
        .join(" "),
    );
  }
  if (descriptor.metadata.invocations.includes("subcommand") && commandNames) {
    variants.push(`${commandName} ${commandNames}`);
  }
  return variants;
}

function renderCommandUsage(
  descriptor: CommandDescriptor,
  parentDescriptor?: CommandDescriptor,
): string {
  const metadata = descriptor.metadata;
  const parentMetadata = parentDescriptor?.metadata;
  const subcommands = visibleCommandDescriptors(descriptor.subcommands);
  const commandName = usageCommandName(metadata, parentMetadata);
  const positionalEntries = descriptor.arguments
    .filter((argument) => argument.type === "positional")
    .map((argument) => ({
      label: positionalLabel(argument),
      description: argumentDescription(argument),
    }));
  const optionEntries = descriptor.arguments
    .filter((argument) => argument.type !== "positional")
    .map((argument) => ({
      label: flagLabel(argument),
      description: argumentDescription(argument),
    }));
  const commandEntries = subcommands.map(({ key, metadata: subcommandMetadata }) => ({
    label: [key ?? subcommandMetadata.name, ...subcommandMetadata.aliases]
      .filter((name): name is string => name !== undefined)
      .join(", "),
    description: subcommandMetadata.description,
  }));
  const lines = [
    ...(metadata.description ? wrapHelpText(metadata.description, getHelpTerminalWidth()) : []),
    "",
    `  ${renderDisplayText([span("Usage", "strong")])}`,
    ...usageVariants(commandName, descriptor).map((usage) => `    ${usage}`),
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

  const examples = metadata.examples;
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

function renderRootUsage(descriptor: CommandDescriptor): string {
  const metadata = descriptor.metadata;
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

  for (const { key, metadata: commandMetadata } of visibleCommandDescriptors(
    descriptor.subcommands,
  )) {
    if (!commandMetadata.commandGroup) {
      continue;
    }
    groupedEntries[commandMetadata.commandGroup].push({
      label: key ?? commandMetadata.name ?? "command",
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

  const rootOnlyFlags = descriptor.arguments
    .filter((argument) => argument.scope === "root-only")
    .map((argument) => ({
      label: flagLabel(argument),
      description: argument.description,
    }));
  const globalFlags = descriptor.arguments
    .filter((argument) => argument.scope !== "root-only")
    .map((argument) => ({
      label: flagLabel(argument),
      description: argument.description,
    }));
  if (rootOnlyFlags.length > 0) {
    lines.push(
      "",
      `  ${renderDisplayText([span("Root options", "strong")])}`,
      ...formatHelpEntries(rootOnlyFlags),
    );
  }
  lines.push(
    "",
    `  ${renderDisplayText([span("Global flags", "strong")])}`,
    ...formatHelpEntries(globalFlags),
  );

  const examples = metadata.examples;
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

export function renderAltertableUsageFromDescriptor(
  descriptor: CommandDescriptor,
  parentDescriptor?: CommandDescriptor,
): string {
  if (parentDescriptor === undefined && descriptor.metadata.name === "altertable") {
    return renderRootUsage(descriptor);
  }

  return renderCommandUsage(descriptor, parentDescriptor);
}

export async function renderAltertableUsage(command: Command, parent?: Command): Promise<string> {
  const [descriptor, parentDescriptor] = await Promise.all([
    resolveCommandDescriptor(command),
    parent ? resolveCommandDescriptor(parent) : undefined,
  ]);
  return renderAltertableUsageFromDescriptor(descriptor, parentDescriptor);
}

type StructuredArgument = {
  name: string;
  aliases: string[];
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
  values?: string[];
  scope: CommandArgumentDescriptor["scope"];
  repeatable?: boolean;
};

export type StructuredHelp = {
  command: string;
  description: string;
  usage: string[];
  aliases: string[];
  arguments: StructuredArgument[];
  options: StructuredArgument[];
  subcommands: Array<{ name: string; aliases: string[]; description: string }>;
  global_options: StructuredArgument[];
  examples: string[];
};

function structuredArgument(argument: CommandArgumentDescriptor): StructuredArgument {
  return {
    name: argument.name,
    aliases: argument.aliases,
    type: argument.type,
    required: argument.required,
    description: argument.description,
    scope: argument.scope,
    ...(argument.repeatable ? { repeatable: true } : {}),
    ...(argument.default !== undefined ? { default: argument.default } : {}),
    ...(argument.values.length > 0 ? { values: argument.values } : {}),
  };
}

export function buildStructuredHelpFromDescriptor(
  descriptor: CommandDescriptor,
  parentDescriptor?: CommandDescriptor,
  rootDescriptor?: CommandDescriptor,
): StructuredHelp {
  const metadata = descriptor.metadata;
  const parentMetadata = parentDescriptor?.metadata;
  const subcommands = visibleCommandDescriptors(descriptor.subcommands);
  const commandName = usageCommandName(metadata, parentMetadata);
  const isRootCommand = parentDescriptor === undefined && metadata.name === "altertable";
  const usage = isRootCommand
    ? ["altertable <command> [flags]"]
    : usageVariants(commandName, descriptor);
  const entries = descriptor.arguments.map(structuredArgument);
  const globalArguments = isRootCommand
    ? (rootDescriptor?.arguments ?? [])
    : (rootDescriptor?.arguments.filter((argument) => argument.scope === "global") ?? []);

  return {
    command: commandName,
    description: metadata.description,
    usage,
    aliases: metadata.aliases,
    arguments: entries.filter((entry) => entry.type === "positional"),
    options: isRootCommand ? [] : entries.filter((entry) => entry.type !== "positional"),
    subcommands: subcommands.map(({ key, metadata: subcommandMetadata }) => ({
      name: key ?? subcommandMetadata.name ?? "command",
      aliases: subcommandMetadata.aliases,
      description: subcommandMetadata.description,
    })),
    global_options: globalArguments.map(structuredArgument),
    examples: metadata.examples,
  };
}

export async function buildStructuredHelp(
  command: Command,
  parent?: Command,
  root?: Command,
): Promise<StructuredHelp> {
  const descriptorPromise = resolveCommandDescriptor(command);
  const [descriptor, parentDescriptor, rootDescriptor] = await Promise.all([
    descriptorPromise,
    parent ? resolveCommandDescriptor(parent) : undefined,
    root ? (root === command ? descriptorPromise : resolveCommandDescriptor(root)) : undefined,
  ]);
  return buildStructuredHelpFromDescriptor(descriptor, parentDescriptor, rootDescriptor);
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
  const section = formatCommandExamplesSection(
    (await resolveCommandDescriptor(command)).metadata.examples,
  );
  if (section.length === 0) {
    return;
  }
  console.error(`${section.trimStart()}\n`);
}
