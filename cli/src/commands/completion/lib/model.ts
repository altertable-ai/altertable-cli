import {
  collectCompletionContexts,
  type CompletionContext,
  type CompletionFlag,
  type CompletionNode,
} from "@/commands/completion/lib/spec.ts";

export type CompletionModel = {
  root: CompletionNode;
  contexts: CompletionContext[];
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

function allFlags(root: CompletionNode): CompletionFlag[] {
  return [...root.flags, ...collectCompletionContexts(root).flatMap((context) => context.flags)];
}

function edgeKey(parent: readonly string[], child: string): string {
  return `${parent.join("/")}|${child}`;
}

export function buildCompletionModel(root: CompletionNode): CompletionModel {
  const contexts = collectCompletionContexts(root);
  const flags = allFlags(root);
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
      subcommandEdges.add(edgeKey(context.segments, subcommand));
    }
    for (const operand of context.soleDirectOperands) {
      soleDirectEdges.add(edgeKey(context.segments, operand));
    }
  }

  const model = {
    root,
    contexts,
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
  argvBeforeCursor: readonly string[],
): NormalizedCompletionArgv {
  const commandPath: string[] = [];
  const positionals: string[] = [];
  let expectsFlagValue = false;
  let afterSeparator = false;
  let ambiguous:
    | { parentPath: string[]; selectedPath: string[]; operand: string; helpRequested: boolean }
    | undefined;

  for (let index = 0; index < argvBeforeCursor.length; index += 1) {
    const word = argvBeforeCursor[index];
    if (word === undefined) continue;

    if (!afterSeparator && word === "--") {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator && model.valueFlags.has(word)) {
      if (index + 1 >= argvBeforeCursor.length) {
        expectsFlagValue = true;
        break;
      }
      index += 1;
      continue;
    }
    if (
      !afterSeparator &&
      ([...model.valueFlags].some((flag) => word.startsWith(`${flag}=`)) ||
        model.booleanFlags.has(word))
    ) {
      if (ambiguous && (word === "--help" || word === "-h")) {
        ambiguous.helpRequested = true;
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
      model.subcommandEdges.has(edgeKey(commandPath, word))
    ) {
      const parentPath = [...commandPath];
      commandPath.push(word);
      if (model.soleDirectEdges.has(edgeKey(parentPath, word))) {
        ambiguous = {
          parentPath,
          selectedPath: [...commandPath],
          operand: word,
          helpRequested: false,
        };
      }
      continue;
    }
    positionals.push(word);
  }

  if (
    ambiguous &&
    !ambiguous.helpRequested &&
    positionals.length === 0 &&
    commandPath.join("/") === ambiguous.selectedPath.join("/")
  ) {
    commandPath.splice(0, commandPath.length, ...ambiguous.parentPath);
    positionals.push(ambiguous.operand);
  }

  return { commandPath, positionals, expectsFlagValue };
}

export function findCompletionContext(
  model: CompletionModel,
  commandPath: readonly string[],
): CompletionContext | undefined {
  const path = commandPath.join("/");
  return model.contexts.find((context) => context.segments.join("/") === path);
}
