import type { ExecutionContext } from "@/lib/execution-context.ts";
import type { CliRuntime, OutputSink } from "@/lib/runtime.ts";

export type Resolvable<T> = T | Promise<T> | (() => T | Promise<T>);
export type PositionalCompletionKind = "finite" | "file" | "freeform";
export type CommandFlagScope = "root-only" | "global" | "command";
export type CommandInvocationKind = "direct" | "subcommand";
export type CommandArgumentType = "boolean" | "string" | "enum" | "positional";

export type CommandArgument = {
  type?: CommandArgumentType;
  alias?: string | readonly string[];
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: readonly string[];
  values?: readonly string[];
  completion?: Exclude<PositionalCompletionKind, "finite">;
  directRequired?: boolean;
  flagScope?: CommandFlagScope;
  valueHint?: string;
  repeatable?: boolean;
};

export type CommandArguments = Record<string, CommandArgument>;
export type AltertableCommandGroup = "platform" | "ingest" | "query";

export type CommandMetadata = {
  name?: string;
  description?: string;
  alias?: string | readonly string[];
  examples?: readonly string[];
  hidden?: boolean;
  commandGroup?: AltertableCommandGroup;
  invocations?: readonly CommandInvocationKind[];
};

type ParsedArgumentValue = string | boolean | string[] | undefined;
export type ParsedCommandArguments<T extends CommandArguments = CommandArguments> = {
  [K in keyof T]: T[K] extends { type: "boolean" } ? boolean | undefined : ParsedArgumentValue;
} & Record<string, ParsedArgumentValue>;

export type CommandRunContext<T extends CommandArguments = CommandArguments> = {
  args: ParsedCommandArguments<T>;
  rawArgs: string[];
  command: Command;
  runtime: CliRuntime;
  sink: OutputSink;
  readonly execution: ExecutionContext;
};

export type CommandDefinition<T extends CommandArguments = CommandArguments> = {
  metadata?: Resolvable<CommandMetadata | undefined>;
  args?: Resolvable<T>;
  subcommands?: Resolvable<Record<string, Resolvable<Command>>>;
  /**
   * Values that select direct execution only when they are the command's sole
   * positional operand. This resolves intentional command/subcommand ambiguity,
   * such as `query show` (SQL) versus `query show <query-id>`.
   */
  soleDirectOperands?: readonly string[];
  run?: (context: CommandRunContext<T>) => void | Promise<void>;
};

export type Command = CommandDefinition<any>;

export function defineArguments<const T extends CommandArguments>(arguments_: T): T {
  return arguments_;
}

export function defineCommand<const T extends CommandArguments = CommandArguments>(
  definition: CommandDefinition<T>,
): CommandDefinition<T> {
  return definition;
}

export function commandArgumentValues(argument: CommandArgument): readonly string[] {
  if (argument.values) return argument.values;
  if (argument.type === "enum" && argument.options) return argument.options;
  return [];
}

export async function resolveCommandValue<T>(value: Resolvable<T>): Promise<T> {
  if (typeof value === "function") {
    return await (value as () => T | Promise<T>)();
  }
  return await value;
}
