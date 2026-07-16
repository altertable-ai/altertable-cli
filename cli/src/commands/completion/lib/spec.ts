import type { Command } from "@/lib/command.ts";

/**
 * Static completion spec derived from the command tree.
 *
 * Subcommand nesting is limited to two levels below the root command
 * (e.g. `altertable api connections`). Flag extraction applies to each visited
 * node only; deeper positional args are not completed.
 */
export type CompletionNode = {
  name: string;
  description?: string;
  subcommands: CompletionNode[];
  flags: CompletionFlag[];
};

export type CompletionFlag = {
  name: string;
  alias?: string;
  description?: string;
  values?: string[];
};

export type CompletionContext = {
  /** Command path segments after the root binary, e.g. ["api", "connections", "create"]. */
  segments: string[];
  /** Flags defined on the node at this path (not including root flags — formatters merge root). */
  flags: CompletionFlag[];
  /** Subcommand names available at this path (empty on leaves). */
  subcommands: string[];
};

/** Max subcommand depth below root (top-level = 1, e.g. api → connections → list). */
const MAX_SUBCOMMAND_DEPTH = 3;

type ArgDef = {
  type?: string;
  alias?: string | string[];
  description?: string;
  options?: string[];
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
    });
  }

  return flags.sort((left, right) => left.name.localeCompare(right.name));
}

function resolveAliases(value: unknown): string[] {
  if (!value) {
    return [];
  }
  const aliases = Array.isArray(value) ? value : [value];
  return aliases.map(String);
}

function resolveSubcommandNames(command: Command): string[] {
  const meta = command.meta;
  if (meta && typeof meta === "object" && "hidden" in meta && meta.hidden) {
    return [];
  }
  if (meta && typeof meta === "object" && "name" in meta && meta.name) {
    const aliases = "alias" in meta ? resolveAliases(meta.alias) : [];
    return [...new Set([String(meta.name), ...aliases])];
  }
  return [];
}

function resolveMetaDescription(command: Command): string | undefined {
  const meta = command.meta;
  if (meta && typeof meta === "object" && "description" in meta && meta.description) {
    return String(meta.description);
  }
  return undefined;
}

function resolveRootName(root: Command): string {
  const meta = root.meta;
  if (meta && typeof meta === "object" && "name" in meta && meta.name) {
    return String(meta.name);
  }
  return "altertable";
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
  const node: CompletionNode = {
    name,
    description: resolveMetaDescription(command),
    subcommands: [],
    flags: extractFlags(command),
  };

  if (depth >= MAX_SUBCOMMAND_DEPTH || !command.subCommands) {
    return node;
  }

  node.subcommands = walkSubcommands(command.subCommands, depth + 1);
  return node;
}

export function buildCompletionSpec(root: Command): CompletionNode {
  const spec: CompletionNode = {
    name: resolveRootName(root),
    description: resolveMetaDescription(root),
    subcommands: [],
    flags: extractFlags(root),
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
