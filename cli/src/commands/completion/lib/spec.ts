import type { Command } from "@/lib/command.ts";
import type { CommandFlagScope, PositionalCompletionKind } from "@/lib/command.ts";
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
  soleDirectOperands: string[];
};

export type CompletionFlag = {
  name: string;
  alias?: string;
  description?: string;
  values?: string[];
  takesValue?: boolean;
  scope?: CommandFlagScope;
};

export type CompletionPositional = {
  name: string;
  description?: string;
  required: boolean;
  completion: PositionalCompletionKind;
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
  /** Subcommand-shaped values that select direct invocation when they are the sole operand. */
  soleDirectOperands: string[];
};

/** Max subcommand depth below root (top-level = 1, e.g. api → connections → list). */
const MAX_SUBCOMMAND_DEPTH = 3;

function extractFlags(commandArguments: readonly CommandArgumentDescriptor[]): CompletionFlag[] {
  return commandArguments
    .filter((argument) => ["boolean", "string", "enum"].includes(argument.type))
    .map((argument) => ({
      name: argument.name,
      alias: argument.aliases[0],
      description: argument.description || undefined,
      values: argument.values.length > 0 ? argument.values : undefined,
      takesValue: argument.type === "string" || argument.type === "enum",
      scope: argument.scope,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function extractPositionals(
  commandArguments: readonly CommandArgumentDescriptor[],
): CompletionPositional[] {
  return commandArguments
    .filter((argument) => argument.type === "positional")
    .map((argument) => ({
      name: argument.name,
      description: argument.description || undefined,
      required: argument.required,
      completion: argument.positionalCompletion ?? "freeform",
      values: argument.values,
    }));
}

function publicCommandNames(descriptor: CommandDescriptor): string[] {
  const metadata = descriptor.metadata;
  if (metadata.hidden || !metadata.name) return [];
  return [...new Set([metadata.name, ...metadata.aliases])];
}

function buildCompletionNode(
  descriptor: CommandDescriptor,
  name: string,
  depth: number,
): CompletionNode {
  const metadata = descriptor.metadata;
  const subcommands =
    depth >= MAX_SUBCOMMAND_DEPTH
      ? []
      : visibleCommandDescriptors(descriptor.subcommands)
          .flatMap((subcommand) =>
            publicCommandNames(subcommand).map((subcommandName) =>
              buildCompletionNode(subcommand, subcommandName, depth + 1),
            ),
          )
          .sort((left, right) => left.name.localeCompare(right.name));

  return {
    name,
    description: metadata.description || undefined,
    subcommands,
    flags: extractFlags(descriptor.arguments),
    positionals: extractPositionals(descriptor.arguments),
    soleDirectOperands: [...descriptor.soleDirectOperands],
  };
}

export function buildCompletionSpecFromDescriptor(descriptor: CommandDescriptor): CompletionNode {
  return buildCompletionNode(descriptor, descriptor.metadata.name ?? "altertable", 0);
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
      soleDirectOperands: node.soleDirectOperands,
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
