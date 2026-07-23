import type { AltertableCommandGroup } from "@/lib/command.ts";
import {
  visibleCommandDescriptors,
  type CommandArgumentDescriptor,
  type CommandDescriptor,
} from "@/lib/command-descriptor.ts";

const GROUP_TITLES: Record<AltertableCommandGroup, string> = {
  platform: "Platform",
  ingest: "Ingest",
  query: "Query",
};

export const CLI_REFERENCE_SCHEMA_VERSION = 1;

export type CliReferenceArgument = {
  name: string;
  aliases: string[];
  type: string;
  description: string;
  required: boolean;
  repeatable: boolean;
  scope: string;
  values: string[];
  positionalCompletion?: string;
  valueHint?: string;
  default?: unknown;
};

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

function argumentValueLabel(argument: CommandArgumentDescriptor): string {
  if (argument.valueHint) return argument.valueHint.toUpperCase();
  if (argument.values.length > 0) return argument.values.join("|").toUpperCase();
  return argument.name.toUpperCase();
}

function positionalToken(argument: CommandArgumentDescriptor): string {
  const value = argumentValueLabel(argument);
  return argument.required ? `<${value}>` : `[${value}]`;
}

function renderUsage(descriptor: CommandDescriptor, commandPath: readonly string[]): string[] {
  const positionals = descriptor.arguments.filter((argument) => argument.type === "positional");
  const hasOptions = descriptor.arguments.some((argument) => argument.type !== "positional");
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

function projectArgument(argument: CommandArgumentDescriptor): CliReferenceArgument {
  return {
    name: argument.name,
    aliases: argument.aliases,
    type: argument.type,
    description: argument.description,
    required: argument.required,
    repeatable: argument.repeatable,
    scope: argument.scope,
    values: argument.values,
    ...(argument.positionalCompletion
      ? { positionalCompletion: argument.positionalCompletion }
      : {}),
    ...(argument.valueHint ? { valueHint: argument.valueHint } : {}),
    ...(argument.default !== undefined ? { default: argument.default } : {}),
  };
}

function commandId(commandPath: readonly string[]): string {
  return commandPath.join("-");
}

function projectCommand(
  descriptor: CommandDescriptor,
  parentPath: readonly string[],
): CliReferenceCommand {
  const name = descriptor.metadata.name ?? descriptor.key ?? "command";
  const commandPath = [...parentPath, name];
  const commandArguments = descriptor.arguments.map(projectArgument);

  return {
    id: commandId(commandPath),
    command: commandPath.join(" "),
    description: descriptor.metadata.description,
    usage: renderUsage(descriptor, commandPath),
    aliases: descriptor.metadata.aliases,
    arguments: commandArguments.filter((argument) => argument.type === "positional"),
    options: commandArguments.filter((argument) => argument.type !== "positional"),
    examples: descriptor.metadata.examples,
    subcommands: visibleCommandDescriptors(descriptor.subcommands).map((subcommand) =>
      projectCommand(subcommand, commandPath),
    ),
  };
}

/**
 * Projects the canonical command descriptor into the versioned public contract
 * consumed by the documentation site. Keep this schema purpose-built for the
 * CLI; it is not an OpenAPI representation.
 */
export function renderCommandReferenceJson(root: CommandDescriptor, cliVersion: string): string {
  const rootName = root.metadata.name ?? "altertable";
  const topLevelCommands = visibleCommandDescriptors(root.subcommands);
  const reference: CliReference = {
    schemaVersion: CLI_REFERENCE_SCHEMA_VERSION,
    cliVersion,
    globalOptions: root.arguments
      .filter((argument) => argument.type !== "positional")
      .map(projectArgument),
    groups: (["platform", "ingest", "query"] as const)
      .map((group) => ({
        id: group,
        title: GROUP_TITLES[group],
        commands: topLevelCommands
          .filter((command) => command.metadata.commandGroup === group)
          .map((command) => projectCommand(command, [rootName])),
      }))
      .filter((group) => group.commands.length > 0),
  };

  return `${JSON.stringify(reference, null, 2)}\n`;
}
