import type { Command } from "@/lib/command.ts";
import {
  resolveCommandDescriptor,
  visibleCommandDescriptors,
  type CommandArgumentDescriptor,
  type CommandDescriptor,
} from "@/lib/command-descriptor.ts";

/**
 * Static completion spec projected from the normalized command descriptor.
 *
 * Subcommand nesting is limited to three levels below the root command.
 * Flags and finite positional values are extracted from each visited node.
 */
export type CompletionNode = {
  name: string;
  description?: string;
  subcommands: CompletionNode[];
  flags: CompletionFlag[];
  positionals: CompletionPositional[];
};

export type CompletionFlag = {
  name: string;
  alias?: string;
  description?: string;
  values?: string[];
  takesValue?: boolean;
};

export type CompletionPositional = {
  name: string;
  description?: string;
  required: boolean;
  values?: readonly string[];
};

export type CompletionContext = {
  /** Command path segments after the root binary, e.g. ["api", "connections", "create"]. */
  segments: string[];
  /** Flags defined on the node at this path (not including root flags — formatters merge root). */
  flags: CompletionFlag[];
  /** Subcommand names available at this path (empty on leaves). */
  subcommands: string[];
  /** Positional arguments declared on this node, in command order. */
  positionals: CompletionPositional[];
};

/** Max subcommand depth below root (top-level = 1, e.g. api → connections → list). */
const MAX_SUBCOMMAND_DEPTH = 3;

function extractFlags(arguments_: readonly CommandArgumentDescriptor[]): CompletionFlag[] {
  return arguments_
    .filter((argument) => ["boolean", "string", "enum"].includes(argument.type))
    .map((argument) => ({
      name: argument.name,
      alias: argument.aliases[0],
      description: argument.description || undefined,
      values: argument.values.length > 0 ? argument.values : undefined,
      takesValue: argument.type === "string" || argument.type === "enum",
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function extractPositionals(
  arguments_: readonly CommandArgumentDescriptor[],
): CompletionPositional[] {
  return arguments_
    .filter((argument) => argument.type === "positional")
    .map((argument) => ({
      name: argument.name,
      description: argument.description || undefined,
      required: argument.required,
      values: argument.values,
    }));
}

function resolveSubcommandNames(descriptor: CommandDescriptor): string[] {
  const metadata = descriptor.metadata;
  if (metadata.hidden || !metadata.name) return [];
  return [...new Set([metadata.name, ...metadata.aliases])];
}

function walkSubcommands(
  descriptors: readonly CommandDescriptor[],
  depth: number,
): CompletionNode[] {
  const nodes = visibleCommandDescriptors(descriptors).map((descriptor) =>
    resolveSubcommandNames(descriptor).map((name) => walkCommand(name, descriptor, depth)),
  );
  return nodes.flat().sort((left, right) => left.name.localeCompare(right.name));
}

function walkCommand(name: string, descriptor: CommandDescriptor, depth: number): CompletionNode {
  const metadata = descriptor.metadata;
  const node: CompletionNode = {
    name,
    description: metadata.description || undefined,
    subcommands: [],
    flags: extractFlags(descriptor.arguments),
    positionals: extractPositionals(descriptor.arguments),
  };

  if (depth >= MAX_SUBCOMMAND_DEPTH) {
    return node;
  }

  node.subcommands = walkSubcommands(descriptor.subcommands, depth + 1);
  return node;
}

export function buildCompletionSpecFromDescriptor(descriptor: CommandDescriptor): CompletionNode {
  const metadata = descriptor.metadata;
  const spec: CompletionNode = {
    name: metadata.name ?? "altertable",
    description: metadata.description || undefined,
    subcommands: [],
    flags: extractFlags(descriptor.arguments),
    positionals: extractPositionals(descriptor.arguments),
  };

  spec.subcommands = walkSubcommands(descriptor.subcommands, 1);
  return spec;
}

export async function buildCompletionSpec(root: Command): Promise<CompletionNode> {
  return buildCompletionSpecFromDescriptor(await resolveCommandDescriptor(root));
}

export function collectCompletionContexts(root: CompletionNode): CompletionContext[] {
  const contexts: CompletionContext[] = [];

  function walk(node: CompletionNode, segments: string[]): void {
    contexts.push({
      segments: [...segments],
      flags: node.flags,
      subcommands: node.subcommands.map((child) => child.name),
      positionals: node.positionals,
    });

    for (const child of node.subcommands) {
      walk(child, [...segments, child.name]);
    }
  }

  for (const child of root.subcommands) {
    walk(child, [child.name]);
  }

  return contexts;
}
