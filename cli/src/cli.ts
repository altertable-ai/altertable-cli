#!/usr/bin/env bun
import { VERSION } from "@/version.ts";
import {
  getCliContext,
  getBootstrapCliContext,
  isJsonOutput,
  setCliContext,
  type CliContext,
} from "@/context.ts";
import { createCliRuntime, setCliRuntime } from "@/lib/runtime.ts";
import { mergeGlobalFlagsFromArgs, parseGlobalOutputFlags } from "@/lib/global-flags.ts";
import { buildTopLevelCommands } from "@/commands/index.ts";
import {
  CliError,
  EXIT_SUCCESS,
  getCliExitCode,
  isCommandParseError,
  shouldShowCommandExamplesOnError,
} from "@/lib/errors.ts";
import { renderCliError, renderCliErrorDetails, renderCliErrorJson } from "@/ui/error.ts";
import {
  defineArgs,
  defineRootCommand,
  runCommandTree,
  type Command,
  type CommandArg,
} from "@/lib/command.ts";
import {
  resolveSubCommandForUsage,
  showAltertableUsage,
  showCommandExamplesForArgs,
} from "@/lib/usage.ts";
import { findEarlyBootstrapExit } from "@/lib/early-bootstrap.ts";
import { applyTerminalColorFromContext } from "@/ui/terminal/styles.ts";
import { maybeShowUpdateNotice } from "@/lib/updater.ts";
import { validateEnvironment } from "@/lib/env.ts";

function buildEarlyCliContext(argv: readonly string[]): CliContext {
  return parseGlobalOutputFlags(argv);
}

const ROOT_ARGS = defineArgs({
  help: {
    type: "boolean",
    alias: "h",
    description: "Show this help",
    flagScope: "global",
  },
  version: {
    type: "boolean",
    alias: "v",
    description: "Show the Altertable CLI version",
    flagScope: "root-only",
  },
  debug: {
    type: "boolean",
    alias: "d",
    description: "Enable debug output",
    flagScope: "global",
  },
  json: {
    type: "boolean",
    description: "Machine-readable JSON output",
    flagScope: "global",
  },
  agent: {
    type: "boolean",
    description: "Agent-friendly preset: structured JSON output, no pager or terminal styling",
    flagScope: "global",
  },
  "no-color": {
    type: "boolean",
    description: "Disable terminal colors and styling",
    flagScope: "global",
  },
  profile: {
    type: "string",
    description: "Use a named profile for this command only",
    flagScope: "global",
  },
  "connect-timeout": {
    type: "string",
    description: "HTTP connect timeout in seconds (default 5)",
    flagScope: "global",
  },
  "read-timeout": {
    type: "string",
    description: "HTTP read timeout in seconds (default 60; 0 = no limit for streams)",
    flagScope: "global",
  },
});

export function resolveTopLevelCommandName(rawArgs: readonly string[]): string | undefined {
  let afterSeparator = false;
  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = rawArgs[index];
    if (argument === undefined) continue;
    if (argument === "--") {
      afterSeparator = true;
      continue;
    }
    if (afterSeparator) return undefined;
    const definition = Object.entries(ROOT_ARGS).find(
      ([name, candidate]) =>
        argument.split("=", 1)[0] === `--${name}` ||
        ("alias" in candidate &&
          candidate.alias !== undefined &&
          `-${String(candidate.alias)}` === argument.split("=", 1)[0]),
    )?.[1] as CommandArg | undefined;
    if (definition) {
      if (!argument.includes("=") && definition.type === "string") {
        index += 1;
      }
      continue;
    }
    if (!argument.startsWith("-")) return argument;
  }
  return undefined;
}

export function buildMainCommand(): Command {
  let mainCommand: Command;

  const topLevelCommands = buildTopLevelCommands(() => mainCommand);

  mainCommand = defineRootCommand({
    meta: {
      name: "altertable",
      description: `Altertable CLI v${VERSION} • Query and manage your data platform from the terminal.`,
      examples: [
        "altertable profile configure",
        "altertable profile show",
        "altertable api routes",
        "altertable api /environments/production/databases",
        'altertable query "SELECT * FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10"',
      ],
    },
    args: ROOT_ARGS,
    subCommands: topLevelCommands,
    run({ args }) {
      setCliContext(mergeGlobalFlagsFromArgs(getCliContext(), args));
    },
  });

  return mainCommand;
}

const main = buildMainCommand();

const initialContext = getBootstrapCliContext();
applyTerminalColorFromContext(initialContext);
setCliRuntime(createCliRuntime(initialContext));

function handleCliError(error: unknown): never {
  const context = getCliContext();
  if (isJsonOutput(context)) {
    console.error(renderCliErrorJson(error));
  } else {
    console.error(renderCliError(error));

    if (error instanceof CliError && error.details) {
      console.error(renderCliErrorDetails(error.details));
    }
  }

  if (context.debug && error instanceof Error && error.stack) {
    console.error(error.stack);
  }

  process.exit(getCliExitCode(error));
}

async function bootstrap(): Promise<void> {
  const originalArgs = process.argv.slice(2);
  const rawArgs = originalArgs;

  try {
    // Activate only non-throwing output flags before parsing the full invocation.
    // This preserves JSON errors while keeping profiles and timeouts inside the
    // command parser's error boundary.
    const earlyContext = buildEarlyCliContext(rawArgs);
    applyTerminalColorFromContext(earlyContext);
    setCliContext(earlyContext);

    const earlyExit = findEarlyBootstrapExit(rawArgs);
    if (earlyExit?.id === "help") {
      const [command, parent] = await resolveSubCommandForUsage(main, rawArgs);
      await showAltertableUsage(command, parent, main);
      await maybeShowUpdateNotice({
        context: getCliContext(),
        commandName: resolveTopLevelCommandName(rawArgs) ?? "help",
      });
      process.exit(EXIT_SUCCESS);
    }

    if (earlyExit?.id === "version") {
      console.log(VERSION);
      return;
    }

    validateEnvironment();
    await runCommandTree(main, { rawArgs });
    await maybeShowUpdateNotice({
      context: getCliContext(),
      commandName: resolveTopLevelCommandName(rawArgs),
    });
  } catch (error) {
    const showExamplesOnHumanOutput = !isJsonOutput(getCliContext());

    if (isCommandParseError(error)) {
      const [command, parent] = await resolveSubCommandForUsage(main, rawArgs);
      if (showExamplesOnHumanOutput) {
        await showAltertableUsage(command, parent);
      }
    } else if (showExamplesOnHumanOutput && shouldShowCommandExamplesOnError(error)) {
      await showCommandExamplesForArgs(main, rawArgs);
    }
    handleCliError(error);
  }
}

if (import.meta.main) {
  void bootstrap();
}
