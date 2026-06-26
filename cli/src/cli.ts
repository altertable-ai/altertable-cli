#!/usr/bin/env bun
import { runCommand, showUsage, type CommandDef } from "citty";
import packageJson from "../package.json";
import { VERSION } from "@/version.ts";
import {
  getCliContext,
  getBootstrapCliContext,
  setCliContext,
  type CliContext,
} from "@/context.ts";
import { createCliRuntime, refreshCliRuntimeContext, setCliRuntime } from "@/lib/runtime.ts";
import { parseGlobalFlags, parseGlobalFlagsFromArgs } from "@/lib/global-flags.ts";
import { configureCommand } from "@/commands/configure.ts";
import { profileCommand } from "@/commands/profile.ts";
import { whoamiCommand } from "@/commands/whoami.ts";
import { catalogsCommand } from "@/commands/catalogs.ts";
import {
  appendCommand,
  autocompleteCommand,
  queryCommand,
  uploadCommand,
  validateCommand,
} from "@/commands/lakehouse.ts";
import { apiCommand } from "@/commands/api.ts";
import { createCompletionCommand } from "@/commands/completion.ts";
import {
  CliError,
  EXIT_SUCCESS,
  getCliExitCode,
  isCittyCliError,
  renderCliError,
  renderCliErrorJson,
} from "@/lib/errors.ts";
import { defineRootCommand } from "@/lib/command-context.ts";
import { resolveSubCommandForUsage } from "@/lib/citty-usage.ts";
import { findEarlyBootstrapExit } from "@/lib/early-bootstrap.ts";

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
    whoami: whoamiCommand,
    catalogs: catalogsCommand,
    query: queryCommand,
    validate: validateCommand,
    append: appendCommand,
    upload: uploadCommand,
    autocomplete: autocompleteCommand,
    api: apiCommand,
    completion: completionCommand,
  };

  mainCommand = defineRootCommand({
    meta: {
      name: "altertable",
      version: VERSION,
      description: packageJson.description,
    },
    args: {
      debug: { type: "boolean", alias: "d", description: "Enable debug output" },
      json: { type: "boolean", description: "Machine-readable JSON output" },
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
setCliRuntime(createCliRuntime(initialContext));
refreshCliRuntimeContext(initialContext);

function handleCliError(error: unknown): never {
  const context = getCliContext();
  if (context.json) {
    console.error(renderCliErrorJson(error));
  } else {
    console.error(renderCliError(error));

    if (error instanceof CliError && error.details) {
      console.error(`[ERROR] ${error.details}`);
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
  setCliContext(buildEarlyCliContext(rawArgs));

  try {
    const earlyExit = findEarlyBootstrapExit(rawArgs);
    if (earlyExit?.id === "help") {
      const [command, parent] = await resolveSubCommandForUsage(main, rawArgs);
      await showUsage(command, parent);
      process.exit(EXIT_SUCCESS);
    }

    if (earlyExit?.id === "version") {
      console.log(VERSION);
      return;
    }

    await runCommand(main, { rawArgs });
  } catch (error) {
    if (isCittyCliError(error)) {
      const [command, parent] = await resolveSubCommandForUsage(main, rawArgs);
      await showUsage(command, parent);
    }
    handleCliError(error);
  }
}

if (import.meta.main) {
  void bootstrap();
}
