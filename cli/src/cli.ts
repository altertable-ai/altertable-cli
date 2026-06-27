#!/usr/bin/env bun
import { runCommand, type CommandDef } from "citty";
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
import { configureCommand } from "@/commands/configure.ts";
import { profileCommand } from "@/commands/profile.ts";
import { contextCommand } from "@/commands/context.ts";
import { catalogsCommand } from "@/commands/catalogs.ts";
import { appendCommand, queryCommand, uploadCommand } from "@/commands/lakehouse.ts";
import { apiCommand } from "@/commands/api.ts";
import { createCompletionCommand } from "@/commands/completion.ts";
import {
  CliError,
  EXIT_SUCCESS,
  getCliExitCode,
  isCittyCliError,
  renderCliError,
  renderCliErrorJson,
  shouldShowCommandExamplesOnError,
} from "@/lib/errors.ts";
import { defineRootCommand } from "@/lib/command-context.ts";
import {
  resolveSubCommandForUsage,
  showAltertableUsage,
  showCommandExamplesForArgs,
} from "@/lib/citty-usage.ts";
import { findEarlyBootstrapExit } from "@/lib/early-bootstrap.ts";
import { terminalError, applyTerminalColorFromContext } from "@/lib/terminal-style.ts";

function buildCliContextFromArgs(args: Record<string, unknown>): CliContext {
  return parseGlobalFlagsFromArgs(args);
}

function buildEarlyCliContext(argv: readonly string[]): CliContext {
  return parseGlobalFlags(argv);
}

export function buildMainCommand(): CommandDef {
  let mainCommand: CommandDef;

  const completionCommand = createCompletionCommand(() => mainCommand);

  const topLevelCommands: Record<string, CommandDef> = {
    configure: configureCommand,
    profile: profileCommand,
    context: contextCommand,
    catalogs: catalogsCommand,
    query: queryCommand,
    append: appendCommand,
    upload: uploadCommand,
    api: apiCommand,
    completion: completionCommand,
  };

  mainCommand = defineRootCommand({
    meta: {
      name: "altertable",
      description: `Altertable CLI v${VERSION} • Query and manage your data platform from the terminal.`,
      examples: [
        "altertable configure",
        "altertable context",
        "altertable api routes",
        "altertable api GET /environments/production/databases",
        'altertable query --statement "SELECT 1"',
      ],
    },
    args: {
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
    },
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
      console.error(`${terminalError("ERROR")} ${error.details}`);
    }
  }

  if (context.debug && error instanceof Error && error.stack) {
    console.error(error.stack);
  }

  process.exit(getCliExitCode(error));
}

async function bootstrap(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  // Early parse only for --help, --version, and JSON error envelope before citty runs.
  const earlyContext = buildEarlyCliContext(rawArgs);
  applyTerminalColorFromContext(earlyContext);
  setCliContext(earlyContext);

  try {
    const earlyExit = findEarlyBootstrapExit(rawArgs);
    if (earlyExit?.id === "help") {
      const [command, parent] = await resolveSubCommandForUsage(main, rawArgs);
      await showAltertableUsage(command, parent);
      process.exit(EXIT_SUCCESS);
    }

    if (earlyExit?.id === "version") {
      console.log(VERSION);
      return;
    }

    await runCommand(main, { rawArgs });
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
