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

  for (const context of contexts) {
    for (const subcommand of context.subcommands) {
      subcommandEdges.add(edgeKey(context.segments, subcommand));
    }
  }

  const model = {
    root,
    contexts,
    subcommandEdges,
    valueFlags,
    booleanFlags,
  };

  for (const context of contexts) {
    const normalized = normalizeCompletionArgv(model, context.segments);
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
      commandPath.push(word);
      continue;
    }
    positionals.push(word);
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
