import {
  commandArgumentValues,
  type AltertableCommandGroup,
  type AltertableCommandMeta,
  type Command,
  type CommandArg,
  type CommandArgs,
  type CommandInvocationKind,
  type PositionalCompletionKind,
} from "@/lib/command.ts";

export type CommandMetadata = {
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
  requiredExplicitly: boolean;
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
  metadata: CommandMetadata;
  arguments: CommandArgumentDescriptor[];
  subcommands: CommandDescriptor[];
};

function toStrings(value: string | string[] | readonly string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined ? [] : [String(value)];
}

async function resolveValue<T>(value: T | (() => T) | (() => Promise<T>) | Promise<T>): Promise<T> {
  if (typeof value === "function") {
    return await (value as () => T | Promise<T>)();
  }
  return await value;
}

export function normalizeCommandMetadata(
  metadata: AltertableCommandMeta | undefined,
): CommandMetadata {
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
  definition: CommandArg,
): CommandArgumentDescriptor {
  const aliases = "alias" in definition ? toStrings(definition.alias) : [];
  const values = commandArgumentValues(definition).map(String);
  const required =
    definition.default === undefined &&
    (definition.type === "positional"
      ? definition.required !== false
      : definition.required === true);

  return {
    name,
    aliases,
    type: definition.type ?? "string",
    description: definition.description ?? "",
    required,
    requiredExplicitly: definition.required !== undefined || definition.default !== undefined,
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

export async function resolveCommandMetadata(command: Command): Promise<CommandMetadata> {
  const metadata = await resolveValue(
    command.meta ?? Promise.resolve<AltertableCommandMeta | undefined>(undefined),
  );
  return normalizeCommandMetadata(metadata as AltertableCommandMeta | undefined);
}

async function resolveCommandArguments(command: Command): Promise<CommandArgumentDescriptor[]> {
  const args = (await resolveValue(command.args ?? {})) as CommandArgs;
  return Object.entries(args).map(([name, definition]) =>
    normalizeCommandArgument(name, definition),
  );
}

async function resolveSubcommands(command: Command): Promise<CommandDescriptor[]> {
  const subcommands = await resolveValue(command.subCommands ?? {});
  return await Promise.all(
    Object.entries(subcommands).map(async ([key, child]) =>
      resolveCommandDescriptor(await resolveValue(child), key),
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
