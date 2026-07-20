import {
  collectCompletionContexts,
  type CompletionContext,
  type CompletionFlag,
  type CompletionNode,
} from "@/commands/completion/lib/spec.ts";

export type CompletionModel = {
  contexts: CompletionContext[];
  contextsByPath: ReadonlyMap<string, CompletionContext>;
  subcommandEdges: ReadonlySet<string>;
  soleDirectEdges: ReadonlySet<string>;
  valueFlags: ReadonlySet<string>;
  booleanFlags: ReadonlySet<string>;
};

export type NormalizedCompletionArgv = {
  commandPath: string[];
  positionals: string[];
  expectsFlagValue: boolean;
};

function flagForms(flag: CompletionFlag): string[] {
  return flag.alias ? [`-${flag.alias}`, `--${flag.name}`] : [`--${flag.name}`];
}

function allFlags(root: CompletionNode, contexts: readonly CompletionContext[]): CompletionFlag[] {
  return [...root.flags, ...contexts.flatMap((context) => context.flags)];
}

function commandEdgeKey(parent: readonly string[], child: string): string {
  return `${parent.join("/")}|${child}`;
}

export function buildCompletionModel(root: CompletionNode): CompletionModel {
  const contexts = collectCompletionContexts(root);
  const contextsByPath = new Map(contexts.map((context) => [context.segments.join("/"), context]));
  const flags = allFlags(root, contexts);
  const valueFlags = new Set(flags.filter((flag) => flag.takesValue).flatMap(flagForms));
  const booleanFlags = new Set(
    flags
      .filter((flag) => !flag.takesValue)
      .flatMap(flagForms)
      .filter((flag) => !valueFlags.has(flag)),
  );
  const subcommandEdges = new Set<string>();
  const soleDirectEdges = new Set<string>();

  for (const context of contexts) {
    for (const subcommand of context.subcommands) {
      subcommandEdges.add(commandEdgeKey(context.segments, subcommand));
    }
    for (const operand of context.soleDirectOperands) {
      soleDirectEdges.add(commandEdgeKey(context.segments, operand));
    }
  }

  const model = {
    contexts,
    contextsByPath,
    subcommandEdges,
    soleDirectEdges,
    valueFlags,
    booleanFlags,
  };

  for (const context of contexts) {
    const normalized = normalizeCompletionArgv(model, [...context.segments, "--help"]);
    if (findCompletionContext(model, normalized.commandPath) !== context) {
      throw new TypeError(`Invalid completion context: ${context.segments.join(" ")}`);
    }
  }

  return model;
}

export function normalizeCompletionArgv(
  model: CompletionModel,
  tokens: readonly string[],
): NormalizedCompletionArgv {
  const commandPath: string[] = [];
  const positionals: string[] = [];
  let expectsFlagValue = false;
  let afterSeparator = false;
  let ambiguousCommand:
    | { parentPath: string[]; operand: string; helpRequested: boolean }
    | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const word = tokens[index];
    if (word === undefined) continue;

    if (!afterSeparator && word === "--") {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator && model.valueFlags.has(word)) {
      if (index + 1 >= tokens.length) {
        expectsFlagValue = true;
        break;
      }
      index += 1;
      continue;
    }
    if (
      !afterSeparator &&
      (isInlineValueOption(model.valueFlags, word) || model.booleanFlags.has(word))
    ) {
      if (ambiguousCommand && (word === "--help" || word === "-h")) {
        ambiguousCommand.helpRequested = true;
      }
      continue;
    }

    if (commandPath.length === 0) {
      commandPath.push(word);
      continue;
    }
    if (
      !afterSeparator &&
      positionals.length === 0 &&
      model.subcommandEdges.has(commandEdgeKey(commandPath, word))
    ) {
      const parentPath = [...commandPath];
      commandPath.push(word);
      if (model.soleDirectEdges.has(commandEdgeKey(parentPath, word))) {
        ambiguousCommand = {
          parentPath,
          operand: word,
          helpRequested: false,
        };
      }
      continue;
    }
    positionals.push(word);
  }

  if (
    ambiguousCommand &&
    !ambiguousCommand.helpRequested &&
    positionals.length === 0 &&
    commandPath.length === ambiguousCommand.parentPath.length + 1 &&
    commandPath.at(-1) === ambiguousCommand.operand
  ) {
    commandPath.splice(0, commandPath.length, ...ambiguousCommand.parentPath);
    positionals.push(ambiguousCommand.operand);
  }

  return { commandPath, positionals, expectsFlagValue };
}

export function findCompletionContext(
  model: CompletionModel,
  commandPath: readonly string[],
): CompletionContext | undefined {
  return model.contextsByPath.get(commandPath.join("/"));
}

function isInlineValueOption(valueOptions: ReadonlySet<string>, token: string): boolean {
  for (const option of valueOptions) {
    if (token.startsWith(`${option}=`)) return true;
  }
  return false;
}
