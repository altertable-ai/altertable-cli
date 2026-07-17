import type { ArgsDef, CommandContext, CommandDef, CommandMeta, Resolvable } from "citty";
export { runCommand as runCommandTree } from "citty";
import type { CliRuntime, OutputSink } from "@/lib/runtime.ts";
import { getCliRuntime } from "@/lib/runtime.ts";
import { createExecutionContext, type ExecutionContext } from "@/lib/execution-context.ts";

export type Command = CommandDef;
export type PositionalCompletionKind = "finite" | "file" | "freeform";
export type CommandFlagScope = "root-only" | "global" | "command";
export type CommandArg = import("citty").ArgDef & {
  /** Finite values normalized into the shared command descriptor. */
  values?: readonly string[];
  /** Shell completion behavior for positional arguments without finite values. */
  completion?: Exclude<PositionalCompletionKind, "finite">;
  /** Required for direct execution even when the parser must allow sibling subcommands. */
  directRequired?: boolean;
  /** Where an option is valid and should be advertised. */
  flagScope?: CommandFlagScope;
};
export type CommandArgs = Record<string, CommandArg>;

export type AltertableCommandGroup = "platform" | "ingest" | "query";
export type CommandInvocationKind = "direct" | "subcommand";

/** Presentation metadata normalized into the shared command descriptor. */
export type AltertableCommandMeta = CommandMeta & {
  examples?: readonly string[];
  hidden?: boolean;
  commandGroup?: AltertableCommandGroup;
  invocations?: readonly CommandInvocationKind[];
};

export type CommandRunContext<T extends ArgsDef = ArgsDef> = CommandContext<T> & {
  runtime: CliRuntime;
  sink: OutputSink;
  readonly execution: ExecutionContext;
};

export type AltertableCommandDef<T extends ArgsDef = ArgsDef> = Omit<
  CommandDef<T>,
  "run" | "setup" | "cleanup" | "subCommands" | "meta"
> & {
  meta?: Resolvable<AltertableCommandMeta>;
  run?: (context: CommandRunContext<T>) => any;
  setup?: (context: CommandRunContext<T>) => any;
  cleanup?: (context: CommandRunContext<T>) => any;
  subCommands?: Record<string, CommandDef<any>>;
};

export type CommandTreeDef<T extends ArgsDef = ArgsDef> = AltertableCommandDef<T> | CommandDef<T>;

export function defineArgs<const T extends ArgsDef>(args: T): T {
  return args;
}

export function commandArgumentValues(definition: CommandArg): readonly string[] {
  if (definition.values) return definition.values;
  if (definition.type === "enum" && definition.options) return definition.options;
  return [];
}

function withCommandRuntime<T extends ArgsDef>(context: CommandContext<T>): CommandRunContext<T> {
  const runtime = getCliRuntime();
  let execution: ExecutionContext | undefined;
  return {
    ...context,
    runtime,
    sink: runtime.output,
    get execution() {
      execution ??= createExecutionContext(runtime);
      return execution;
    },
  };
}

function bindCommandTree<T extends ArgsDef>(def: CommandTreeDef<T>): CommandDef {
  const { run, setup, cleanup, subCommands, ...rest } = def as AltertableCommandDef<T>;

  const bound: CommandDef = { ...rest };

  if (subCommands) {
    bound.subCommands = Object.fromEntries(
      Object.entries(subCommands).map(([name, subCommand]) => [name, bindCommandTree(subCommand)]),
    );
  }

  if (setup) {
    bound.setup = (context) => setup(withCommandRuntime(context as CommandContext<T>));
  }
  if (cleanup) {
    bound.cleanup = (context) => cleanup(withCommandRuntime(context as CommandContext<T>));
  }
  if (run) {
    bound.run = (context) => run(withCommandRuntime(context as CommandContext<T>));
  }

  return bound;
}

export function defineCommand<const T extends ArgsDef = ArgsDef>(
  def: AltertableCommandDef<T>,
): CommandDef {
  return def as CommandDef;
}

/** Erases citty's inferred args generic so the root command fits heterogeneous trees. */
export type RootCommandDef<T extends ArgsDef = ArgsDef> = Omit<CommandDef<T>, "meta"> & {
  meta?: Resolvable<AltertableCommandMeta>;
};

export function defineRootCommand<const T extends ArgsDef>(def: RootCommandDef<T>): CommandDef {
  return bindCommandTree(def);
}
