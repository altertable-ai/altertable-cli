import {
  commandArgumentValues,
  resolveCommandValue,
  type Command,
  type CommandArgument,
  type CommandArguments,
  type CommandMetadata,
} from "@/lib/command.ts";
import { createExecutionContext, type ExecutionContext } from "@/lib/execution-context.ts";
import { getCliRuntime } from "@/lib/runtime.ts";

type ParsedArgumentValue = string | boolean | string[] | undefined;
type ParsedArguments = Record<string, ParsedArgumentValue>;

type OptionBinding = {
  name: string;
  argument: CommandArgument;
};

type ResolvedSubcommand = {
  name: string;
  command: Command;
};

type ResolvedCommand = {
  definition: Command;
  arguments: CommandArguments;
  subcommandsByName: ReadonlyMap<string, ResolvedSubcommand>;
};

type SelectedInvocation = {
  root: ResolvedCommand;
  command: ResolvedCommand;
  parent?: Command;
  commandPath: string[];
  commandTokenIndexes: ReadonlySet<number>;
};

type SelectionValidation = "strict" | "lenient";

export type CommandSelection = {
  command: Command;
  parent?: Command;
  commandPath: string[];
};

export class CommandParseError extends Error {
  code: string;

  constructor(message: string, code = "E_PARSE") {
    super(message);
    this.name = "CLIError";
    this.code = code;
  }
}

function stringList(value: string | readonly string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined ? [] : [String(value)];
}

async function resolveCommand(command: Command): Promise<ResolvedCommand> {
  const [arguments_, subcommands] = await Promise.all([
    resolveCommandValue(command.args ?? {}),
    resolveCommandValue(command.subcommands ?? {}),
  ]);
  const entries = await Promise.all(
    Object.entries(subcommands).map(async ([name, resolvableCommand]) => {
      const child = await resolveCommandValue(resolvableCommand);
      const metadata = await resolveCommandValue<CommandMetadata | undefined>(
        child.metadata ?? undefined,
      );
      return { name, child, aliases: stringList(metadata?.alias) };
    }),
  );
  const subcommandsByName = new Map<string, ResolvedSubcommand>();
  for (const { name, child, aliases } of entries) {
    const subcommand = { name, command: child };
    subcommandsByName.set(name, subcommand);
    for (const alias of aliases) subcommandsByName.set(alias, subcommand);
  }
  return { definition: command, arguments: arguments_, subcommandsByName };
}

function optionBindings(arguments_: CommandArguments): Map<string, OptionBinding> {
  const bindings = new Map<string, OptionBinding>();
  for (const [name, argument] of Object.entries(arguments_)) {
    if (argument.type === "positional") continue;
    const binding = { name, argument };
    bindings.set(`--${name}`, binding);
    for (const alias of stringList(argument.alias)) {
      bindings.set(`-${alias}`, binding);
    }
  }
  return bindings;
}

function availableOptions(
  rootArguments: CommandArguments,
  commandArguments: CommandArguments,
): Map<string, OptionBinding> {
  return new Map([...optionBindings(rootArguments), ...optionBindings(commandArguments)]);
}

function optionName(token: string): string {
  const equalsIndex = token.indexOf("=");
  return equalsIndex === -1 ? token : token.slice(0, equalsIndex);
}

function inlineOptionValue(token: string): string | undefined {
  const equalsIndex = token.indexOf("=");
  return equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
}

function takesValue(argument: CommandArgument): boolean {
  return argument.type === "string" || argument.type === "enum";
}

function nextOptionValue(
  tokens: readonly string[],
  optionIndex: number,
  options: ReadonlyMap<string, OptionBinding>,
): string | undefined {
  const candidate = tokens[optionIndex + 1];
  if (candidate === undefined || candidate === "--") return undefined;
  if (candidate.startsWith("-") && options.has(optionName(candidate))) return undefined;
  return candidate;
}

function inspectFollowingTokens(
  tokens: readonly string[],
  startIndex: number,
  options: ReadonlyMap<string, OptionBinding>,
): { hasOperand: boolean; helpRequested: boolean } {
  let afterSeparator = false;
  let hasOperand = false;
  let helpRequested = false;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (!afterSeparator && token === "--") {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator && token.startsWith("-")) {
      const name = optionName(token);
      if (name === "--help" || name === "-h") helpRequested = true;
      const binding = options.get(name);
      if (
        binding &&
        takesValue(binding.argument) &&
        inlineOptionValue(token) === undefined &&
        nextOptionValue(tokens, index, options) !== undefined
      ) {
        index += 1;
      }
      continue;
    }
    hasOperand = true;
  }

  return { hasOperand, helpRequested };
}

function prefersDirectInvocation(
  command: ResolvedCommand,
  operand: string,
  tokens: readonly string[],
  operandIndex: number,
  options: ReadonlyMap<string, OptionBinding>,
): boolean {
  if (!command.definition.soleDirectOperands?.includes(operand)) return false;
  const following = inspectFollowingTokens(tokens, operandIndex + 1, options);
  return !following.hasOperand && !following.helpRequested;
}

async function selectInvocation(
  root: Command,
  tokens: readonly string[],
  validation: SelectionValidation,
): Promise<SelectedInvocation> {
  const resolvedRoot = await resolveCommand(root);
  let command = resolvedRoot;
  let parent: Command | undefined;
  let options = availableOptions(resolvedRoot.arguments, command.arguments);
  const commandPath: string[] = [];
  const commandTokenIndexes = new Set<number>();
  let afterSeparator = false;
  let hasDirectOperand = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;

    if (!afterSeparator && token === "--") {
      afterSeparator = true;
      hasDirectOperand = true;
      continue;
    }

    if (!afterSeparator && token.startsWith("-")) {
      const name = optionName(token);
      const binding = options.get(name);
      if (!binding) {
        if (validation === "strict") throw new CommandParseError(`Unknown option ${name}.`);
        continue;
      }
      if (binding.argument.flagScope === "root-only" && tokens.length !== 1) {
        if (validation === "strict") {
          throw new CommandParseError(`${name} is only valid at the command root.`);
        }
        continue;
      }
      if (takesValue(binding.argument) && inlineOptionValue(token) === undefined) {
        if (nextOptionValue(tokens, index, options) === undefined) {
          if (validation === "strict") {
            throw new CommandParseError(`Missing value for ${name}.`);
          }
          continue;
        }
        index += 1;
      }
      continue;
    }

    const subcommand = command.subcommandsByName.get(token);
    const canSelectSubcommand =
      !afterSeparator &&
      (command === resolvedRoot ||
        (!hasDirectOperand && !prefersDirectInvocation(command, token, tokens, index, options)));

    if (subcommand && canSelectSubcommand) {
      parent = command.definition;
      command = await resolveCommand(subcommand.command);
      options = availableOptions(resolvedRoot.arguments, command.arguments);
      commandPath.push(subcommand.name);
      commandTokenIndexes.add(index);
      hasDirectOperand = false;
      continue;
    }

    if (command === resolvedRoot) {
      if (validation === "strict") throw new CommandParseError(`Unknown command ${token}.`);
      continue;
    }
    hasDirectOperand = true;
  }

  return {
    root: resolvedRoot,
    command,
    ...(parent ? { parent } : {}),
    commandPath,
    commandTokenIndexes,
  };
}

export async function resolveCommandSelection(
  root: Command,
  tokens: readonly string[],
): Promise<CommandSelection> {
  const invocation = await selectInvocation(root, tokens, "lenient");
  return {
    command: invocation.command.definition,
    ...(invocation.parent ? { parent: invocation.parent } : {}),
    commandPath: invocation.commandPath,
  };
}

function assignParsedValue(
  parsed: ParsedArguments,
  name: string,
  argument: CommandArgument,
  value: string | boolean,
): void {
  if (argument.repeatable) {
    const previous = parsed[name];
    parsed[name] = [...(Array.isArray(previous) ? previous : []), String(value)];
    return;
  }
  parsed[name] = value;
}

function validateArgumentValue(name: string, argument: CommandArgument, value: string): void {
  const values = commandArgumentValues(argument);
  if (argument.type === "enum" && values.length > 0 && !values.includes(value)) {
    throw new CommandParseError(`--${name} must be one of: ${values.join(", ")}.`);
  }
}

function isParserRequired(argument: CommandArgument): boolean {
  return (
    argument.default === undefined &&
    (argument.type === "positional" ? argument.required !== false : argument.required === true)
  );
}

function applyDefaultsAndValidate(parsed: ParsedArguments, arguments_: CommandArguments): void {
  for (const [name, argument] of Object.entries(arguments_)) {
    if (parsed[name] === undefined && argument.default !== undefined) {
      parsed[name] = argument.default as ParsedArgumentValue;
    }
    const required = argument.directRequired ?? isParserRequired(argument);
    if (required && parsed[name] === undefined) {
      const label = argument.type === "positional" ? name : `--${name}`;
      throw new CommandParseError(`Missing required argument: ${label}.`);
    }
  }
}

function parseInvocationArguments(
  invocation: SelectedInvocation,
  tokens: readonly string[],
): ParsedArguments {
  const options = availableOptions(invocation.root.arguments, invocation.command.arguments);
  const positionals = Object.entries(invocation.command.arguments).filter(
    ([, argument]) => argument.type === "positional",
  );
  const parsed: ParsedArguments = {};
  let positionalIndex = 0;
  let afterSeparator = false;

  for (let index = 0; index < tokens.length; index += 1) {
    if (invocation.commandTokenIndexes.has(index)) continue;
    const token = tokens[index];
    if (token === undefined) continue;
    if (!afterSeparator && token === "--") {
      afterSeparator = true;
      continue;
    }

    if (!afterSeparator && token.startsWith("-")) {
      const name = optionName(token);
      const binding = options.get(name);
      if (!binding) throw new CommandParseError(`Unknown option ${name}.`);
      if (binding.argument.flagScope === "root-only" && tokens.length !== 1) {
        throw new CommandParseError(`${name} is only valid at the command root.`);
      }
      if (takesValue(binding.argument)) {
        const inlineValue = inlineOptionValue(token);
        const value = inlineValue ?? nextOptionValue(tokens, index, options);
        if (value === undefined) throw new CommandParseError(`Missing value for ${name}.`);
        validateArgumentValue(binding.name, binding.argument, value);
        assignParsedValue(parsed, binding.name, binding.argument, value);
        if (inlineValue === undefined) index += 1;
      } else {
        if (inlineOptionValue(token) !== undefined) {
          throw new CommandParseError(`${name} does not take a value.`);
        }
        assignParsedValue(parsed, binding.name, binding.argument, true);
      }
      continue;
    }

    const positional = positionals[positionalIndex];
    if (!positional) throw new CommandParseError(`Unexpected argument: ${token}.`);
    const [name, argument] = positional;
    validateArgumentValue(name, argument, token);
    assignParsedValue(parsed, name, argument, token);
    positionalIndex += 1;
  }

  applyDefaultsAndValidate(parsed, invocation.root.arguments);
  if (invocation.command !== invocation.root) {
    applyDefaultsAndValidate(parsed, invocation.command.arguments);
  }
  return parsed;
}

function createRunContext(command: Command, args: ParsedArguments, rawArgs: readonly string[]) {
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

export async function executeCommand(
  root: Command,
  rawArgs: readonly string[],
): Promise<CommandSelection> {
  const invocation = await selectInvocation(root, rawArgs, "strict");
  const parsed = parseInvocationArguments(invocation, rawArgs);
  if (root.run) {
    await root.run(createRunContext(root, parsed, rawArgs));
  }
  const selected = invocation.command.definition;
  if (selected !== root && selected.run) {
    await selected.run(createRunContext(selected, parsed, rawArgs));
  }
  return {
    command: selected,
    ...(invocation.parent ? { parent: invocation.parent } : {}),
    commandPath: invocation.commandPath,
  };
}
