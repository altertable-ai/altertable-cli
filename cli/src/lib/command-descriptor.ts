import {
  commandArgumentValues,
  resolveCommandValue,
  type AltertableCommandGroup,
  type Command,
  type CommandArgument,
  type CommandArguments,
  type CommandFlagScope,
  type CommandInvocationKind,
  type CommandMetadata,
  type PositionalCompletionKind,
} from "@/lib/command.ts";

export type ResolvedCommandMetadata = {
  name?: string;
  description: string;
  aliases: string[];
  examples: string[];
  hidden: boolean;
  commandGroup?: AltertableCommandGroup;
  invocations: CommandInvocationKind[];
};

export type CommandArgumentDescriptor = {
  name: string;
  aliases: string[];
  type: string;
  description: string;
  required: boolean;
  parserRequired: boolean;
  requiredExplicitly: boolean;
  repeatable: boolean;
  scope: CommandFlagScope;
  values: string[];
  positionalCompletion?: PositionalCompletionKind;
  valueHint?: string;
  default?: unknown;
};

/**
 * Resolved command contract shared by help, structured help, completion, and
 * generated documentation. `key` is the name used in the parent registry;
 * `metadata.name` is the canonical public command name.
 */
export type CommandDescriptor = {
  key?: string;
  metadata: ResolvedCommandMetadata;
  arguments: CommandArgumentDescriptor[];
  soleDirectOperands: string[];
  subcommands: CommandDescriptor[];
};

function asStringArray(value: string | readonly string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined ? [] : [String(value)];
}

function normalizeCommandMetadata(metadata: CommandMetadata | undefined): ResolvedCommandMetadata {
  return {
    ...(metadata?.name ? { name: String(metadata.name) } : {}),
    description: metadata?.description ?? "",
    aliases: asStringArray(metadata?.alias),
    examples: asStringArray(metadata?.examples),
    hidden: metadata?.hidden === true,
    ...(metadata?.commandGroup ? { commandGroup: metadata.commandGroup } : {}),
    invocations: metadata?.invocations ? [...metadata.invocations] : [],
  };
}

function normalizeCommandArgument(
  name: string,
  argument: CommandArgument,
): CommandArgumentDescriptor {
  const aliases = asStringArray(argument.alias);
  const values = commandArgumentValues(argument).map(String);
  const parserRequired =
    argument.default === undefined &&
    (argument.type === "positional" ? argument.required !== false : argument.required === true);
  const required = argument.directRequired ?? parserRequired;

  return {
    name,
    aliases,
    type: argument.type ?? "string",
    description: argument.description ?? "",
    required,
    parserRequired,
    requiredExplicitly:
      argument.required !== undefined ||
      argument.directRequired !== undefined ||
      argument.default !== undefined,
    repeatable: argument.repeatable === true,
    scope: argument.flagScope ?? "command",
    values,
    ...(argument.type === "positional"
      ? {
          positionalCompletion:
            values.length > 0 ? ("finite" as const) : (argument.completion ?? "freeform"),
        }
      : {}),
    ...(argument.valueHint ? { valueHint: argument.valueHint } : {}),
    ...(argument.default !== undefined ? { default: argument.default } : {}),
  };
}

async function resolveCommandMetadata(command: Command): Promise<ResolvedCommandMetadata> {
  const metadata = await resolveCommandValue<CommandMetadata | undefined>(
    command.metadata ?? undefined,
  );
  return normalizeCommandMetadata(metadata);
}

async function resolveCommandArguments(command: Command): Promise<CommandArgumentDescriptor[]> {
  const commandArguments = (await resolveCommandValue(command.args ?? {})) as CommandArguments;
  return Object.entries(commandArguments).map(([name, argument]) =>
    normalizeCommandArgument(name, argument),
  );
}

async function resolveSubcommands(command: Command): Promise<CommandDescriptor[]> {
  const subcommands = await resolveCommandValue(command.subcommands ?? {});
  return await Promise.all(
    Object.entries(subcommands).map(async ([key, child]) =>
      resolveCommandDescriptor(await resolveCommandValue(child), key),
    ),
  );
}

export async function resolveCommandDescriptor(
  command: Command,
  key?: string,
): Promise<CommandDescriptor> {
  const [metadata, commandArguments, subcommands] = await Promise.all([
    resolveCommandMetadata(command),
    resolveCommandArguments(command),
    resolveSubcommands(command),
  ]);

  const invocations =
    metadata.invocations.length > 0
      ? metadata.invocations
      : [
          ...(subcommands.length === 0 ||
          commandArguments.some((argument) => argument.type === "positional")
            ? (["direct"] as const)
            : []),
          ...(subcommands.length > 0 ? (["subcommand"] as const) : []),
        ];

  return {
    ...(key ? { key } : {}),
    metadata: { ...metadata, invocations },
    arguments: commandArguments,
    soleDirectOperands: [...(command.soleDirectOperands ?? [])],
    subcommands,
  };
}

export function visibleCommandDescriptors(
  descriptors: readonly CommandDescriptor[],
): CommandDescriptor[] {
  return descriptors.filter((descriptor) => !descriptor.metadata.hidden);
}

export function validateCommandDescriptor(root: CommandDescriptor): void {
  const errors: string[] = [];

  function visit(descriptor: CommandDescriptor, path: string[], depth: number): void {
    const canonicalName = descriptor.metadata.name;
    const name = canonicalName ?? descriptor.key ?? "<unnamed>";
    const commandPath = [...path, name];
    const displayPath = commandPath.join(" ");

    if (descriptor.key && descriptor.key !== canonicalName) {
      errors.push(
        `${displayPath}: registry key "${descriptor.key}" must match canonical name "${canonicalName ?? ""}"`,
      );
    }
    if (depth === 1 && !descriptor.metadata.hidden && !descriptor.metadata.commandGroup) {
      errors.push(`${displayPath}: visible root command must declare a help group`);
    }
    for (const argument of descriptor.arguments) {
      if (argument.type === "positional" && !argument.requiredExplicitly) {
        errors.push(`${displayPath} <${argument.name}>: positional requiredness must be explicit`);
      }
    }
    const subcommandNames = new Set(
      descriptor.subcommands.flatMap((subcommand) => [
        ...(subcommand.metadata.name ? [subcommand.metadata.name] : []),
        ...subcommand.metadata.aliases,
      ]),
    );
    const soleDirectOperands = new Set(descriptor.soleDirectOperands);
    for (const operand of soleDirectOperands) {
      if (!subcommandNames.has(operand)) {
        errors.push(
          `${displayPath}: sole direct operand "${operand}" must match a subcommand name or alias`,
        );
      }
    }
    if (soleDirectOperands.size !== descriptor.soleDirectOperands.length) {
      errors.push(`${displayPath}: sole direct operands must be unique`);
    }
    for (const subcommand of descriptor.subcommands) {
      visit(subcommand, commandPath, depth + 1);
    }
  }

  visit(root, [], 0);
  if (errors.length > 0) {
    throw new TypeError(
      `Invalid command descriptor:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
}
