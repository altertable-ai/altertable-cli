import {
  ALTERTABLE_COMMAND_GROUPS,
  COMMAND_ARGUMENT_TYPES,
  COMMAND_FLAG_SCOPES,
  POSITIONAL_COMPLETION_KINDS,
  type AltertableCommandGroup,
} from "@/lib/command.ts";
import {
  visibleCommandDescriptors,
  type CommandArgumentDescriptor,
  type CommandDescriptor,
} from "@/lib/command-descriptor.ts";

export const CLI_REFERENCE_SCHEMA_VERSION = 1;

export type CliReferenceArgument = Omit<
  CommandArgumentDescriptor,
  "parserRequired" | "requiredExplicitly"
>;

export type CliReferenceCommand = {
  id: string;
  command: string;
  description: string;
  usage: string[];
  aliases: string[];
  arguments: CliReferenceArgument[];
  options: CliReferenceArgument[];
  examples: string[];
  subcommands: CliReferenceCommand[];
};

export type CliReferenceGroup = {
  id: AltertableCommandGroup;
  title: string;
  commands: CliReferenceCommand[];
};

export type CliReference = {
  schemaVersion: typeof CLI_REFERENCE_SCHEMA_VERSION;
  cliVersion: string;
  globalOptions: CliReferenceArgument[];
  groups: CliReferenceGroup[];
};

type CommandReferenceModel = CliReference & {
  rootDescription: string;
};

function argumentValueLabel(argument: CliReferenceArgument): string {
  if (argument.valueHint) return argument.valueHint.toUpperCase();
  if (argument.values.length > 0) return argument.values.join("|").toUpperCase();
  return argument.name.toUpperCase();
}

function positionalToken(argument: CliReferenceArgument): string {
  const value = argumentValueLabel(argument);
  return argument.required ? `<${value}>` : `[${value}]`;
}

function optionLabel(argument: CliReferenceArgument): string {
  const aliases = argument.aliases.map((alias) => `-${alias}`);
  const value =
    argument.type === "string" || argument.type === "enum"
      ? ` <${argumentValueLabel(argument)}>`
      : "";
  return [...aliases, `--${argument.name}${value}`].join(", ");
}

function projectArgument({
  parserRequired: _parserRequired,
  requiredExplicitly: _requiredExplicitly,
  ...argument
}: CommandArgumentDescriptor): CliReferenceArgument {
  return argument;
}

function buildUsage(
  descriptor: CommandDescriptor,
  commandPath: readonly string[],
  positionals: readonly CliReferenceArgument[],
  hasOptions: boolean,
): string[] {
  const subcommands = visibleCommandDescriptors(descriptor.subcommands);
  const usage: string[] = [];

  if (descriptor.metadata.invocations.includes("direct")) {
    usage.push(
      [...commandPath, hasOptions ? "[options]" : undefined, ...positionals.map(positionalToken)]
        .filter((token): token is string => token !== undefined)
        .join(" "),
    );
  }
  if (descriptor.metadata.invocations.includes("subcommand") && subcommands.length > 0) {
    usage.push(
      `${commandPath.join(" ")} ${subcommands
        .map((subcommand) => subcommand.metadata.name ?? subcommand.key ?? "command")
        .join("|")}`,
    );
  }

  return usage;
}

function buildCommand(
  descriptor: CommandDescriptor,
  parentPath: readonly string[],
): CliReferenceCommand {
  const name = descriptor.metadata.name ?? descriptor.key ?? "command";
  const commandPath = [...parentPath, name];
  const commandArguments = descriptor.arguments.map(projectArgument);
  const positionals = commandArguments.filter((argument) => argument.type === "positional");
  const options = commandArguments.filter((argument) => argument.type !== "positional");

  return {
    id: commandPath.join("-"),
    command: commandPath.join(" "),
    description: descriptor.metadata.description,
    usage: buildUsage(descriptor, commandPath, positionals, options.length > 0),
    aliases: descriptor.metadata.aliases,
    arguments: positionals,
    options,
    examples: descriptor.metadata.examples,
    subcommands: visibleCommandDescriptors(descriptor.subcommands).map((subcommand) =>
      buildCommand(subcommand, commandPath),
    ),
  };
}

export function buildCommandReference(
  root: CommandDescriptor,
  cliVersion: string,
): CommandReferenceModel {
  const rootName = root.metadata.name ?? "altertable";
  const topLevelCommands = visibleCommandDescriptors(root.subcommands);

  return {
    schemaVersion: CLI_REFERENCE_SCHEMA_VERSION,
    cliVersion,
    rootDescription: root.metadata.description,
    globalOptions: root.arguments
      .filter((argument) => argument.type !== "positional")
      .map(projectArgument),
    groups: ALTERTABLE_COMMAND_GROUPS.map(({ id, title }) => ({
      id,
      title,
      commands: topLevelCommands
        .filter((command) => command.metadata.commandGroup === id)
        .map((command) => buildCommand(command, [rootName])),
    })).filter((group) => group.commands.length > 0),
  };
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function argumentDescription(argument: CliReferenceArgument): string {
  const details = [argument.description];
  if (argument.scope === "root-only") {
    details.push("Scope: root only.");
  }
  if (argument.required) {
    details.push("Required.");
  }
  if (argument.repeatable) {
    details.push("Repeatable.");
  }
  if (argument.values.length > 0) {
    details.push(`Values: ${argument.values.join(", ")}.`);
  }
  if (argument.default !== undefined) {
    details.push(`Default: ${JSON.stringify(argument.default)}.`);
  }
  return details.filter(Boolean).join(" ");
}

function renderArgumentTable(
  title: string,
  commandArguments: readonly CliReferenceArgument[],
  label: (argument: CliReferenceArgument) => string,
): string[] {
  if (commandArguments.length === 0) return [];
  return [
    `**${title}**`,
    "",
    `| ${title === "Arguments" ? "Argument" : "Option"} | Description |`,
    "| --- | --- |",
    ...commandArguments.map(
      (argument) =>
        `| \`${escapeTableCell(label(argument))}\` | ${escapeTableCell(argumentDescription(argument))} |`,
    ),
    "",
  ];
}

function commandName(command: CliReferenceCommand): string {
  return command.command.slice(command.command.lastIndexOf(" ") + 1);
}

function renderCommand(command: CliReferenceCommand, headingLevel: number): string[] {
  const lines = [
    `${"#".repeat(headingLevel)} \`${command.command}\``,
    "",
    command.description,
    "",
    "**Usage**",
    "",
    "```bash",
    ...command.usage,
    "```",
    "",
  ];

  if (command.aliases.length > 0) {
    lines.push(`**Aliases:** ${command.aliases.map((alias) => `\`${alias}\``).join(", ")}`, "");
  }
  lines.push(
    ...renderArgumentTable("Arguments", command.arguments, positionalToken),
    ...renderArgumentTable("Options", command.options, optionLabel),
  );

  if (command.subcommands.length > 0) {
    lines.push(
      "**Subcommands**",
      "",
      ...command.subcommands.map(
        (subcommand) => `- \`${commandName(subcommand)}\` — ${subcommand.description}`,
      ),
      "",
    );
  }
  if (command.examples.length > 0) {
    lines.push("**Examples**", "", "```bash", ...command.examples, "```", "");
  }
  for (const subcommand of command.subcommands) {
    lines.push(...renderCommand(subcommand, Math.min(headingLevel + 1, 6)));
  }
  return lines;
}

export function renderCommandReferenceMarkdown(reference: CommandReferenceModel): string {
  const lines = [
    "<!-- AUTO-GENERATED by cli/scripts/generate-command-reference.ts — do not edit -->",
    "",
    "# Altertable CLI command reference",
    "",
    `${reference.rootDescription} <!-- x-release-please-version -->`,
    "",
    ...renderArgumentTable("Global options", reference.globalOptions, optionLabel),
  ];

  for (const group of reference.groups) {
    lines.push(`## ${group.title}`, "");
    for (const command of group.commands) {
      lines.push(...renderCommand(command, 3));
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function renderCommandReferenceJson(reference: CommandReferenceModel): string {
  const { rootDescription: _rootDescription, ...publicReference } = reference;
  return `${JSON.stringify(publicReference, null, 2)}\n`;
}

export function renderCliReferenceSchema(): string {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://altertable.ai/schemas/cli-reference/v1.json",
    title: "Altertable CLI reference",
    description:
      "Versioned public documentation contract generated from the Altertable CLI command descriptor.",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "cliVersion", "globalOptions", "groups"],
    properties: {
      schemaVersion: { const: CLI_REFERENCE_SCHEMA_VERSION },
      cliVersion: { type: "string" },
      globalOptions: { type: "array", items: { $ref: "#/$defs/argument" } },
      groups: { type: "array", items: { $ref: "#/$defs/group" } },
    },
    $defs: {
      argument: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "aliases",
          "type",
          "description",
          "required",
          "repeatable",
          "scope",
          "values",
        ],
        properties: {
          name: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          type: { enum: COMMAND_ARGUMENT_TYPES },
          description: { type: "string" },
          required: { type: "boolean" },
          repeatable: { type: "boolean" },
          scope: { enum: COMMAND_FLAG_SCOPES },
          values: { type: "array", items: { type: "string" } },
          positionalCompletion: { enum: POSITIONAL_COMPLETION_KINDS },
          valueHint: { type: "string" },
          default: {},
        },
      },
      command: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "command",
          "description",
          "usage",
          "aliases",
          "arguments",
          "options",
          "examples",
          "subcommands",
        ],
        properties: {
          id: { type: "string" },
          command: { type: "string" },
          description: { type: "string" },
          usage: { type: "array", items: { type: "string" } },
          aliases: { type: "array", items: { type: "string" } },
          arguments: { type: "array", items: { $ref: "#/$defs/argument" } },
          options: { type: "array", items: { $ref: "#/$defs/argument" } },
          examples: { type: "array", items: { type: "string" } },
          subcommands: { type: "array", items: { $ref: "#/$defs/command" } },
        },
      },
      group: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "commands"],
        properties: {
          id: { enum: ALTERTABLE_COMMAND_GROUPS.map(({ id }) => id) },
          title: { type: "string" },
          commands: { type: "array", items: { $ref: "#/$defs/command" } },
        },
      },
    },
  };

  return `${JSON.stringify(schema, null, 2)}\n`;
}
