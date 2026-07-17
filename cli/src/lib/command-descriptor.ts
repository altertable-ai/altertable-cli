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

function toStrings(value: string | readonly string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined ? [] : [String(value)];
}

export function normalizeCommandMetadata(
  metadata: CommandMetadata | undefined,
): ResolvedCommandMetadata {
  return {
    ...(metadata?.name ? { name: String(metadata.name) } : {}),
    description: metadata?.description ?? "",
    aliases: toStrings(metadata?.alias),
    examples: toStrings(metadata?.examples),
    hidden: metadata?.hidden === true,
    ...(metadata?.commandGroup ? { commandGroup: metadata.commandGroup } : {}),
    invocations: metadata?.invocations ? [...metadata.invocations] : [],
  };
}

export function normalizeCommandArgument(
  name: string,
  definition: CommandArgument,
): CommandArgumentDescriptor {
  const aliases = "alias" in definition ? toStrings(definition.alias) : [];
  const values = commandArgumentValues(definition).map(String);
  const parserRequired =
    definition.default === undefined &&
    (definition.type === "positional"
      ? definition.required !== false
      : definition.required === true);
  const required = definition.directRequired ?? parserRequired;

  return {
    name,
    aliases,
    type: definition.type ?? "string",
    description: definition.description ?? "",
    required,
    parserRequired,
    requiredExplicitly:
      definition.required !== undefined ||
      definition.directRequired !== undefined ||
      definition.default !== undefined,
    repeatable: definition.repeatable === true,
    scope: definition.flagScope ?? "command",
    values,
    ...(definition.type === "positional"
      ? {
          positionalCompletion:
            values.length > 0 ? ("finite" as const) : (definition.completion ?? "freeform"),
        }
      : {}),
    ...(definition.valueHint ? { valueHint: definition.valueHint } : {}),
    ...(definition.default !== undefined ? { default: definition.default } : {}),
  };
}

export async function resolveCommandMetadata(command: Command): Promise<ResolvedCommandMetadata> {
  const metadata = await resolveCommandValue<CommandMetadata | undefined>(
    command.metadata ?? undefined,
  );
  return normalizeCommandMetadata(metadata);
}

async function resolveCommandArguments(command: Command): Promise<CommandArgumentDescriptor[]> {
  const args = (await resolveCommandValue(command.args ?? {})) as CommandArguments;
  return Object.entries(args).map(([name, definition]) =>
    normalizeCommandArgument(name, definition),
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
  const [metadata, arguments_, subcommands] = await Promise.all([
    resolveCommandMetadata(command),
    resolveCommandArguments(command),
    resolveSubcommands(command),
  ]);

  const invocations =
    metadata.invocations.length > 0
      ? metadata.invocations
      : [
          ...(subcommands.length === 0 ||
          arguments_.some((argument) => argument.type === "positional")
            ? (["direct"] as const)
            : []),
          ...(subcommands.length > 0 ? (["subcommand"] as const) : []),
        ];

  return {
    ...(key ? { key } : {}),
    metadata: { ...metadata, invocations },
    arguments: arguments_,
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
    for (const operand of new Set(descriptor.soleDirectOperands)) {
      if (!subcommandNames.has(operand)) {
        errors.push(
          `${displayPath}: sole direct operand "${operand}" must match a subcommand name or alias`,
        );
      }
    }
    if (new Set(descriptor.soleDirectOperands).size !== descriptor.soleDirectOperands.length) {
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
