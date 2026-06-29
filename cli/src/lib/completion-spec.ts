import type { CommandDef } from "citty";

/**
 * Static completion spec derived from the Citty command tree.
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

function extractFlags(command: CommandDef): CompletionFlag[] {
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

function resolveSubcommandName(_key: string, command: CommandDef): string | undefined {
  const meta = command.meta;
  if (meta && typeof meta === "object" && "name" in meta && meta.name) {
    return String(meta.name);
  }
  return undefined;
}

function resolveMetaDescription(command: CommandDef): string | undefined {
  const meta = command.meta;
  if (meta && typeof meta === "object" && "description" in meta && meta.description) {
    return String(meta.description);
  }
  return undefined;
}

function resolveRootName(root: CommandDef): string {
  const meta = root.meta;
  if (meta && typeof meta === "object" && "name" in meta && meta.name) {
    return String(meta.name);
  }
  return "altertable";
}

function walkCommand(name: string, command: CommandDef, depth: number): CompletionNode {
  const node: CompletionNode = {
    name,
    description: resolveMetaDescription(command),
    subcommands: [],
    flags: extractFlags(command),
  };

  if (depth >= MAX_SUBCOMMAND_DEPTH || !command.subCommands) {
    return node;
  }

  const subcommands = Object.entries(command.subCommands)
    .map(([key, subcommand]) => {
      const resolvedName = resolveSubcommandName(key, subcommand as CommandDef);
      if (!resolvedName) {
        return undefined;
      }
      return walkCommand(resolvedName, subcommand as CommandDef, depth + 1);
    })
    .filter((entry): entry is CompletionNode => entry !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

  node.subcommands = subcommands;
  return node;
}

export function buildCompletionSpec(root: CommandDef): CompletionNode {
  const spec: CompletionNode = {
    name: resolveRootName(root),
    description: resolveMetaDescription(root),
    subcommands: [],
    flags: extractFlags(root),
  };

  if (!root.subCommands) {
    return spec;
  }

  spec.subcommands = Object.entries(root.subCommands)
    .map(([key, subcommand]) => {
      const resolvedName = resolveSubcommandName(key, subcommand as CommandDef);
      if (!resolvedName) {
        return undefined;
      }
      return walkCommand(resolvedName, subcommand as CommandDef, 1);
    })
    .filter((entry): entry is CompletionNode => entry !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

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

export function flattenTopLevelNames(spec: CompletionNode): string[] {
  return spec.subcommands.map((node) => node.name);
}
