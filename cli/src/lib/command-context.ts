import type { ArgsDef, CommandContext, CommandDef, CommandMeta, Resolvable } from "citty";
import type { CliRuntime, OutputSink } from "@/lib/runtime.ts";
import { getCliRuntime } from "@/lib/runtime.ts";

export type AltertableCommandMeta = CommandMeta & {
  examples?: readonly string[];
  hidden?: boolean;
};

export type CommandRunContext<T extends ArgsDef = ArgsDef> = CommandContext<T> & {
  runtime: CliRuntime;
  sink: OutputSink;
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

function withCommandRuntime<T extends ArgsDef>(context: CommandContext<T>): CommandRunContext<T> {
  const runtime = getCliRuntime();
  return { ...context, runtime, sink: runtime.output };
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

export function defineAltertableCommand<const T extends ArgsDef = ArgsDef>(
  def: AltertableCommandDef<T>,
): CommandDef {
  return bindCommandTree(def);
}

/** Erases citty's inferred args generic so the root command fits heterogeneous trees. */
export type RootCommandDef<T extends ArgsDef = ArgsDef> = Omit<CommandDef<T>, "meta"> & {
  meta?: Resolvable<AltertableCommandMeta>;
};

export function defineRootCommand<const T extends ArgsDef>(def: RootCommandDef<T>): CommandDef {
  return bindCommandTree(def);
}
