#!/usr/bin/env bun
import { VERSION } from "@/version.ts";
import {
  getCliContext,
  getBootstrapCliContext,
  isJsonOutput,
  setCliContext,
  type CliContext,
} from "@/context.ts";
import { createCliRuntime, refreshCliRuntimeContext, setCliRuntime } from "@/lib/runtime.ts";
import { parseGlobalFlags, parseGlobalFlagsFromArgs } from "@/lib/global-flags.ts";
import { buildTopLevelCommands, normalizeCommandRawArgs } from "@/commands/index.ts";
import {
  CliError,
  EXIT_SUCCESS,
  getCliExitCode,
  isCittyCliError,
  shouldShowCommandExamplesOnError,
} from "@/lib/errors.ts";
import { renderCliError, renderCliErrorDetails, renderCliErrorJson } from "@/ui/error.ts";
import { defineArgs, defineRootCommand, runCommandTree, type Command } from "@/lib/command.ts";
import {
  resolveSubCommandForUsage,
  showAltertableUsage,
  showCommandExamplesForArgs,
} from "@/lib/usage.ts";
import { findFirstPositionalToken, valueFlagsFor } from "@/lib/command-delegation.ts";
import { findEarlyBootstrapExit } from "@/lib/early-bootstrap.ts";
import { applyTerminalColorFromContext } from "@/ui/terminal/styles.ts";
import { maybeShowUpdateNotice } from "@/lib/updater.ts";
import { validateEnvironment } from "@/lib/env.ts";

function buildCliContextFromArgs(args: Record<string, unknown>): CliContext {
  return parseGlobalFlagsFromArgs(args);
}

function buildEarlyCliContext(argv: readonly string[]): CliContext {
  return parseGlobalFlags(argv);
}

const ROOT_ARGS = defineArgs({
  help: { type: "boolean", alias: "h", description: "Show this help" },
  version: {
    type: "boolean",
    alias: "v",
    description: "Show the Altertable CLI version",
  },
  debug: { type: "boolean", alias: "d", description: "Enable debug output" },
  json: { type: "boolean", description: "Machine-readable JSON output" },
  agent: {
    type: "boolean",
    description: "Agent-friendly preset: structured JSON output, no pager or terminal styling",
  },
  "no-color": {
    type: "boolean",
    description: "Disable terminal colors and styling",
  },
  profile: {
    type: "string",
    description: "Use a named profile for this command only",
  },
  "connect-timeout": {
    type: "string",
    description: "HTTP connect timeout in seconds (default 5)",
  },
  "read-timeout": {
    type: "string",
    description: "HTTP read timeout in seconds (default 60; 0 = no limit for streams)",
  },
});

const ROOT_VALUE_FLAGS = valueFlagsFor(ROOT_ARGS);

export function resolveTopLevelCommandName(rawArgs: readonly string[]): string | undefined {
  return findFirstPositionalToken(rawArgs, { valueFlags: ROOT_VALUE_FLAGS })?.value;
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
    async run({ args }) {
      setCliContext(buildCliContextFromArgs(args));
    },
  });

  return mainCommand;
}

const main = buildMainCommand();

const initialContext = getBootstrapCliContext();
applyTerminalColorFromContext(initialContext);
setCliRuntime(createCliRuntime(initialContext));
refreshCliRuntimeContext(initialContext);

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
  const rawArgs = normalizeCommandRawArgs(originalArgs, ROOT_ARGS);
  // Early parse only for --help, --version, and JSON error envelope before citty runs.
  const earlyContext = buildEarlyCliContext(rawArgs);
  applyTerminalColorFromContext(earlyContext);
  setCliContext(earlyContext);

  try {
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

    if (isCittyCliError(error)) {
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
