import type { ArgsDef, CommandContext, CommandDef } from "citty";
import type { CliRuntime, OutputSink } from "@/lib/runtime.ts";
import { getCliRuntime } from "@/lib/runtime.ts";

export type CommandRunContext<T extends ArgsDef = ArgsDef> = CommandContext<T> & {
  runtime: CliRuntime;
  sink: OutputSink;
};

export type AltertableCommandDef<T extends ArgsDef = ArgsDef> = Omit<
  CommandDef<T>,
  "run" | "setup" | "cleanup" | "subCommands"
> & {
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
export function defineRootCommand<const T extends ArgsDef>(def: CommandDef<T>): CommandDef {
  return bindCommandTree(def);
}
