import type { Command } from "@/lib/command.ts";
import { readCommandMetadata } from "@/lib/command-metadata.ts";

/**
 * Static completion spec derived from the command tree.
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

type ArgDef = {
  type?: string;
  alias?: string | string[];
  description?: string;
  options?: string[];
  required?: boolean;
  completionValues?: readonly string[];
};

function extractFlags(command: Command): CompletionFlag[] {
  const flags: CompletionFlag[] = [];
  const args = command.args ?? {};

  for (const [name, rawDef] of Object.entries(args)) {
    const def = rawDef as ArgDef | undefined;
    if (!def?.type || (def.type !== "boolean" && def.type !== "string" && def.type !== "enum")) {
      continue;
    }

    flags.push({
      name,
      alias: Array.isArray(def.alias) ? def.alias[0] : def.alias,
      description: def.description,
      values: def.type === "enum" ? def.options : undefined,
      takesValue: def.type === "string" || def.type === "enum",
    });
  }

  return flags.sort((left, right) => left.name.localeCompare(right.name));
}

function extractPositionals(command: Command): CompletionPositional[] {
  const positionals: CompletionPositional[] = [];
  const args = command.args ?? {};

  for (const [name, rawDef] of Object.entries(args)) {
    const def = rawDef as ArgDef | undefined;
    if (def?.type !== "positional") continue;
    positionals.push({
      name,
      description: def.description,
      required: def.required !== false,
      values: def.completionValues,
    });
  }

  return positionals;
}

function resolveSubcommandNames(command: Command): string[] {
  const metadata = readCommandMetadata(command);
  if (metadata.hidden || !metadata.name) return [];
  return [...new Set([metadata.name, ...metadata.aliases])];
}

function resolveRootName(root: Command): string {
  return readCommandMetadata(root).name ?? "altertable";
}

function walkSubcommands(subcommands: Command["subCommands"], depth: number): CompletionNode[] {
  if (!subcommands) {
    return [];
  }
  return Object.values(subcommands)
    .flatMap((subcommand) => {
      const command = subcommand as Command;
      return resolveSubcommandNames(command).map((name) => walkCommand(name, command, depth));
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function walkCommand(name: string, command: Command, depth: number): CompletionNode {
  const metadata = readCommandMetadata(command);
  const node: CompletionNode = {
    name,
    description: metadata.description || undefined,
    subcommands: [],
    flags: extractFlags(command),
    positionals: extractPositionals(command),
  };

  if (depth >= MAX_SUBCOMMAND_DEPTH || !command.subCommands) {
    return node;
  }

  node.subcommands = walkSubcommands(command.subCommands, depth + 1);
  return node;
}

export function buildCompletionSpec(root: Command): CompletionNode {
  const metadata = readCommandMetadata(root);
  const spec: CompletionNode = {
    name: resolveRootName(root),
    description: metadata.description || undefined,
    subcommands: [],
    flags: extractFlags(root),
    positionals: extractPositionals(root),
  };

  if (!root.subCommands) {
    return spec;
  }

  spec.subcommands = walkSubcommands(root.subCommands, 1);
  return spec;
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
