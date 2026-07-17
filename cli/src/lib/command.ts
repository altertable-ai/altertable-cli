import type { CliRuntime, OutputSink } from "@/lib/runtime.ts";
import { getCliRuntime } from "@/lib/runtime.ts";
import { createExecutionContext, type ExecutionContext } from "@/lib/execution-context.ts";

export type Resolvable<T> = T | Promise<T> | (() => T | Promise<T>);
export type PositionalCompletionKind = "finite" | "file" | "freeform";
export type CommandFlagScope = "root-only" | "global" | "command";
export type CommandInvocationKind = "direct" | "subcommand";
export type CommandArgType = "boolean" | "string" | "enum" | "positional";

export type CommandArg = {
  type?: CommandArgType;
  alias?: string | string[] | readonly string[];
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

export type CommandArgs = Record<string, CommandArg>;
export type ArgsDef = CommandArgs;
export type AltertableCommandGroup = "platform" | "ingest" | "query";

export type AltertableCommandMeta = {
  name?: string;
  description?: string;
  alias?: string | string[] | readonly string[];
  examples?: readonly string[];
  hidden?: boolean;
  commandGroup?: AltertableCommandGroup;
  invocations?: readonly CommandInvocationKind[];
};

type ParsedArgValue = string | boolean | string[] | undefined;
export type ParsedCommandArgs<T extends ArgsDef = ArgsDef> = {
  [K in keyof T]: T[K] extends { type: "boolean" } ? boolean | undefined : ParsedArgValue;
} & Record<string, ParsedArgValue>;

export type CommandRunContext<T extends ArgsDef = ArgsDef> = {
  args: ParsedCommandArgs<T>;
  rawArgs: string[];
  command: Command;
  runtime: CliRuntime;
  sink: OutputSink;
  readonly execution: ExecutionContext;
};

export type CommandDef<T extends ArgsDef = ArgsDef> = {
  meta?: Resolvable<AltertableCommandMeta | undefined>;
  args?: Resolvable<T>;
  subCommands?: Resolvable<Record<string, Resolvable<Command>>>;
  /**
   * Values that select direct execution only when they are the command's sole
   * positional operand. This resolves intentional command/subcommand ambiguity,
   * such as `query show` (SQL) versus `query show <query-id>`.
   */
  soleDirectOperands?: readonly string[];
  run?: (context: CommandRunContext<T>) => void | Promise<void>;
};

export type Command = CommandDef<any>;
export type AltertableCommandDef<T extends ArgsDef = ArgsDef> = CommandDef<T>;
export type RootCommandDef<T extends ArgsDef = ArgsDef> = CommandDef<T>;

type ResolvedCommand = {
  command: Command;
  args: CommandArgs;
  subCommands: Record<string, Command>;
};

type FlagBinding = {
  name: string;
  definition: CommandArg;
  owner: "root" | "command";
};

type SelectedCommand = {
  command: Command;
  parent?: Command;
  args: CommandArgs;
  commandPath: string[];
  commandTokenIndexes: ReadonlySet<number>;
};

export class CommandParseError extends Error {
  code: string;

  constructor(message: string, code = "E_PARSE") {
    super(message);
    this.name = "CLIError";
    this.code = code;
  }
}

export function defineArgs<const T extends ArgsDef>(args: T): T {
  return args;
}

export function commandArgumentValues(definition: CommandArg): readonly string[] {
  if (definition.values) return definition.values;
  if (definition.type === "enum" && definition.options) return definition.options;
  return [];
}

export function defineCommand<const T extends ArgsDef = ArgsDef>(
  definition: AltertableCommandDef<T>,
): CommandDef<T> {
  return definition;
}

export function defineRootCommand<const T extends ArgsDef>(
  definition: RootCommandDef<T>,
): CommandDef<T> {
  return definition;
}

async function resolveValue<T>(value: Resolvable<T>): Promise<T> {
  if (typeof value === "function") {
    return await (value as () => T | Promise<T>)();
  }
  return await value;
}

async function resolveCommand(command: Command): Promise<ResolvedCommand> {
  const [args, subCommands] = await Promise.all([
    resolveValue(command.args ?? {}),
    resolveValue(command.subCommands ?? {}),
  ]);
  const resolvedSubCommands = await Promise.all(
    Object.entries(subCommands).map(
      async ([name, child]) => [name, await resolveValue(child)] as const,
    ),
  );
  return {
    command,
    args,
    subCommands: Object.fromEntries(resolvedSubCommands),
  };
}

function aliases(definition: CommandArg): string[] {
  if (definition.alias === undefined) return [];
  return Array.isArray(definition.alias)
    ? definition.alias.map(String)
    : [String(definition.alias)];
}

function flagBindings(args: CommandArgs, owner: FlagBinding["owner"]): Map<string, FlagBinding> {
  const bindings = new Map<string, FlagBinding>();
  for (const [name, definition] of Object.entries(args)) {
    if (definition.type === "positional") continue;
    const binding = { name, definition, owner };
    bindings.set(`--${name}`, binding);
    for (const alias of aliases(definition)) {
      bindings.set(`-${alias}`, binding);
    }
  }
  return bindings;
}

function flagName(argument: string): string {
  const equalsIndex = argument.indexOf("=");
  return equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
}

function inlineFlagValue(argument: string): string | undefined {
  const equalsIndex = argument.indexOf("=");
  return equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
}

function commandAliases(metadata: AltertableCommandMeta | undefined): string[] {
  const alias = metadata?.alias;
  if (alias === undefined) return [];
  return Array.isArray(alias) ? alias.map(String) : [String(alias)];
}

async function findSubCommand(
  subCommands: Record<string, Command>,
  operand: string,
): Promise<{ name: string; command: Command } | undefined> {
  const direct = subCommands[operand];
  if (direct) return { name: operand, command: direct };

  for (const [name, command] of Object.entries(subCommands)) {
    const metadata = await resolveValue(command.meta ?? undefined);
    if (commandAliases(metadata).includes(operand)) {
      return { name, command };
    }
  }
  return undefined;
}

function bindingForArgument(
  argument: string,
  commandBindings: ReadonlyMap<string, FlagBinding>,
  rootBindings: ReadonlyMap<string, FlagBinding>,
): FlagBinding | undefined {
  const name = flagName(argument);
  return commandBindings.get(name) ?? rootBindings.get(name);
}

function requiresValue(definition: CommandArg): boolean {
  return definition.type === "string" || definition.type === "enum";
}

function separatedFlagValue(
  rawArgs: readonly string[],
  index: number,
  commandBindings: ReadonlyMap<string, FlagBinding>,
  rootBindings: ReadonlyMap<string, FlagBinding>,
): string | undefined {
  const candidate = rawArgs[index + 1];
  if (candidate === undefined || candidate === "--") return undefined;
  if (
    candidate.startsWith("-") &&
    bindingForArgument(candidate, commandBindings, rootBindings) !== undefined
  ) {
    return undefined;
  }
  return candidate;
}

function positionalTokensAfter(
  rawArgs: readonly string[],
  startIndex: number,
  commandBindings: ReadonlyMap<string, FlagBinding>,
  rootBindings: ReadonlyMap<string, FlagBinding>,
): string[] {
  const values: string[] = [];
  let afterSeparator = false;
  for (let index = startIndex; index < rawArgs.length; index += 1) {
    const argument = rawArgs[index];
    if (argument === undefined) continue;
    if (!afterSeparator && argument === "--") {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator && argument.startsWith("-")) {
      const binding = bindingForArgument(argument, commandBindings, rootBindings);
      if (binding && requiresValue(binding.definition) && inlineFlagValue(argument) === undefined) {
        if (separatedFlagValue(rawArgs, index, commandBindings, rootBindings) !== undefined) {
          index += 1;
        }
      }
      continue;
    }
    values.push(argument);
  }
  return values;
}

async function selectCommand(
  root: Command,
  rawArgs: readonly string[],
  strict = true,
): Promise<SelectedCommand> {
  const resolvedRoot = await resolveCommand(root);
  const rootBindings = flagBindings(resolvedRoot.args, "root");
  let current = resolvedRoot;
  let parent: Command | undefined;
  let commandBindings = flagBindings(current.args, "command");
  const commandPath: string[] = [];
  const commandTokenIndexes = new Set<number>();
  let afterSeparator = false;
  let directOperandSeen = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = rawArgs[index];
    if (argument === undefined) continue;
    if (!afterSeparator && argument === "--") {
      afterSeparator = true;
      directOperandSeen = true;
      continue;
    }

    if (!afterSeparator && argument.startsWith("-")) {
      const binding = bindingForArgument(argument, commandBindings, rootBindings);
      if (!binding) {
        if (strict) throw new CommandParseError(`Unknown option ${flagName(argument)}.`);
        continue;
      }
      if (binding.definition.flagScope === "root-only" && rawArgs.length !== 1) {
        if (strict) {
          throw new CommandParseError(`${flagName(argument)} is only valid at the command root.`);
        }
        continue;
      }
      if (requiresValue(binding.definition) && inlineFlagValue(argument) === undefined) {
        if (separatedFlagValue(rawArgs, index, commandBindings, rootBindings) === undefined) {
          if (strict) throw new CommandParseError(`Missing value for ${flagName(argument)}.`);
          continue;
        }
        index += 1;
      }
      continue;
    }

    if (current.command === root) {
      const selected = await findSubCommand(current.subCommands, argument);
      if (!selected) {
        if (strict) throw new CommandParseError(`Unknown command ${argument}.`);
        continue;
      }
      parent = current.command;
      current = await resolveCommand(selected.command);
      commandBindings = flagBindings(current.args, "command");
      commandPath.push(selected.name);
      commandTokenIndexes.add(index);
      directOperandSeen = false;
      continue;
    }

    if (!afterSeparator && !directOperandSeen) {
      const selected = await findSubCommand(current.subCommands, argument);
      const remainingPositionals = positionalTokensAfter(
        rawArgs,
        index + 1,
        commandBindings,
        rootBindings,
      );
      const helpRequested = rawArgs
        .slice(index + 1)
        .some((candidate) => candidate === "--help" || candidate === "-h");
      const preferDirect =
        current.command.soleDirectOperands?.includes(argument) === true &&
        remainingPositionals.length === 0 &&
        !helpRequested;
      if (selected && !preferDirect) {
        parent = current.command;
        current = await resolveCommand(selected.command);
        commandBindings = flagBindings(current.args, "command");
        commandPath.push(selected.name);
        commandTokenIndexes.add(index);
        continue;
      }
    }
    directOperandSeen = true;
  }

  return {
    command: current.command,
    ...(parent ? { parent } : {}),
    args: current.args,
    commandPath,
    commandTokenIndexes,
  };
}

export async function resolveCommandSelection(
  root: Command,
  rawArgs: readonly string[],
): Promise<{ command: Command; parent?: Command; commandPath: string[] }> {
  const selected = await selectCommand(root, rawArgs, false);
  return {
    command: selected.command,
    ...(selected.parent ? { parent: selected.parent } : {}),
    commandPath: selected.commandPath,
  };
}

function setParsedValue(
  parsed: Record<string, ParsedArgValue>,
  name: string,
  definition: CommandArg,
  value: string | boolean,
): void {
  if (definition.repeatable) {
    const previous = parsed[name];
    parsed[name] = [...(Array.isArray(previous) ? previous : []), String(value)];
    return;
  }
  parsed[name] = value;
}

function validateValue(name: string, definition: CommandArg, value: string): void {
  const values = commandArgumentValues(definition);
  if (definition.type === "enum" && values.length > 0 && !values.includes(value)) {
    throw new CommandParseError(`--${name} must be one of: ${values.join(", ")}.`);
  }
}

function parserRequired(definition: CommandArg): boolean {
  return (
    definition.default === undefined &&
    (definition.type === "positional"
      ? definition.required !== false
      : definition.required === true)
  );
}

function applyDefaultsAndValidate(parsed: Record<string, ParsedArgValue>, args: CommandArgs): void {
  for (const [name, definition] of Object.entries(args)) {
    if (parsed[name] === undefined && definition.default !== undefined) {
      parsed[name] = definition.default as ParsedArgValue;
    }
    const required = definition.directRequired ?? parserRequired(definition);
    if (required && parsed[name] === undefined) {
      const label = definition.type === "positional" ? name : `--${name}`;
      throw new CommandParseError(`Missing required argument: ${label}.`);
    }
  }
}

async function parseCommandArgs(
  root: Command,
  selected: SelectedCommand,
  rawArgs: readonly string[],
): Promise<Record<string, ParsedArgValue>> {
  const rootArgs = (await resolveCommand(root)).args;
  const rootBindings = flagBindings(rootArgs, "root");
  const commandBindings = flagBindings(selected.args, "command");
  const parsed: Record<string, ParsedArgValue> = {};
  const positionals = Object.entries(selected.args).filter(
    ([, definition]) => definition.type === "positional",
  );
  let positionalIndex = 0;
  let afterSeparator = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    if (selected.commandTokenIndexes.has(index)) continue;
    const argument = rawArgs[index];
    if (argument === undefined) continue;
    if (!afterSeparator && argument === "--") {
      afterSeparator = true;
      continue;
    }

    if (!afterSeparator && argument.startsWith("-")) {
      const binding = bindingForArgument(argument, commandBindings, rootBindings);
      if (!binding) {
        throw new CommandParseError(`Unknown option ${flagName(argument)}.`);
      }
      const { name, definition } = binding;
      if (definition.flagScope === "root-only" && rawArgs.length !== 1) {
        throw new CommandParseError(`${flagName(argument)} is only valid at the command root.`);
      }
      if (requiresValue(definition)) {
        const inlineValue = inlineFlagValue(argument);
        const value =
          inlineValue ?? separatedFlagValue(rawArgs, index, commandBindings, rootBindings);
        if (value === undefined) {
          throw new CommandParseError(`Missing value for ${flagName(argument)}.`);
        }
        validateValue(name, definition, value);
        setParsedValue(parsed, name, definition, value);
        if (inlineValue === undefined) index += 1;
      } else {
        if (inlineFlagValue(argument) !== undefined) {
          throw new CommandParseError(`${flagName(argument)} does not take a value.`);
        }
        setParsedValue(parsed, name, definition, true);
      }
      continue;
    }

    const positional = positionals[positionalIndex];
    if (!positional) {
      throw new CommandParseError(`Unexpected argument: ${argument}.`);
    }
    const [name, definition] = positional;
    validateValue(name, definition, argument);
    setParsedValue(parsed, name, definition, argument);
    positionalIndex += 1;
  }

  applyDefaultsAndValidate(parsed, rootArgs);
  if (selected.command !== root) {
    applyDefaultsAndValidate(parsed, selected.args);
  }
  return parsed;
}

function createRunContext(
  command: Command,
  args: Record<string, ParsedArgValue>,
  rawArgs: readonly string[],
): CommandRunContext {
  const runtime = getCliRuntime();
  let execution: ExecutionContext | undefined;
  return {
    command,
    args,
    rawArgs: [...rawArgs],
    runtime,
    sink: runtime.output,
    get execution() {
      execution ??= createExecutionContext(runtime);
      return execution;
    },
  };
}

export async function runCommandTree(root: Command, options: { rawArgs: string[] }): Promise<void> {
  const selected = await selectCommand(root, options.rawArgs);
  const parsed = await parseCommandArgs(root, selected, options.rawArgs);
  if (root.run) {
    await root.run(createRunContext(root, parsed, options.rawArgs));
  }
  if (selected.command !== root && selected.command.run) {
    await selected.command.run(createRunContext(selected.command, parsed, options.rawArgs));
    return;
  }
}
