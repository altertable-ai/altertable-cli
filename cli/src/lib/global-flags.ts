import type { CliContext } from "@/context.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { parseTimeoutSeconds, readArgvFlagValue } from "@/lib/timeout-args.ts";

export const GLOBAL_ARGV_FLAGS_WITH_VALUE: ReadonlySet<string> = new Set([
  "--profile",
  "--connect-timeout",
  "--read-timeout",
]);
const GLOBAL_ARGV_BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  "--debug",
  "-d",
  "--json",
  "--agent",
  "--no-color",
]);

export function isGlobalArgvFlag(argument: string): boolean {
  const flag = argument.split("=", 1)[0] ?? argument;
  return GLOBAL_ARGV_BOOLEAN_FLAGS.has(flag) || GLOBAL_ARGV_FLAGS_WITH_VALUE.has(flag);
}

function readGlobalArgvFlagValue(argv: readonly string[], flagName: string): string | undefined {
  const separatorIndex = argv.indexOf("--");
  return readArgvFlagValue(separatorIndex === -1 ? argv : argv.slice(0, separatorIndex), flagName);
}

export function normalizeGlobalFlagsRawArgs(argv: readonly string[]): string[] {
  const globals: string[] = [];
  const remaining: string[] = [];
  let afterSeparator = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === "--") {
      afterSeparator = true;
      remaining.push(argument);
      continue;
    }
    if (afterSeparator || !isGlobalArgvFlag(argument)) {
      remaining.push(argument);
      continue;
    }

    globals.push(argument);
    const flag = argument.split("=", 1)[0] ?? argument;
    if (!argument.includes("=") && GLOBAL_ARGV_FLAGS_WITH_VALUE.has(flag)) {
      const value = argv[index + 1];
      if (value !== undefined) {
        globals.push(value);
        index += 1;
      }
    }
  }

  return [...globals, ...remaining];
}

export function parseGlobalFlags(argv: readonly string[]): CliContext {
  const separatorIndex = argv.indexOf("--");
  const globalArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const context: CliContext = {
    debug: globalArgs.includes("--debug") || globalArgs.includes("-d"),
    json: globalArgs.includes("--json"),
    agent: globalArgs.includes("--agent"),
    noColor: globalArgs.includes("--no-color"),
  };

  const connectTimeout = readGlobalArgvFlagValue(argv, "--connect-timeout");
  if (connectTimeout !== undefined) {
    context.connectTimeoutMs = parseTimeoutSeconds(connectTimeout, "--connect-timeout");
  }

  const readTimeout = readGlobalArgvFlagValue(argv, "--read-timeout");
  if (readTimeout !== undefined) {
    context.readTimeoutMs = parseTimeoutSeconds(readTimeout, "--read-timeout");
  }

  const profile = readGlobalArgvFlagValue(argv, "--profile");
  if (profile !== undefined && profile.length > 0) {
    context.profile = profile;
  }

  return context;
}

export function parseGlobalFlagsFromArgs(args: Record<string, unknown>): CliContext {
  const context: CliContext = {
    debug: Boolean(args.debug),
    json: Boolean(args.json),
    agent: Boolean(args.agent),
    noColor: Boolean(args["no-color"]),
  };

  const profile = asCliArgString(args.profile);
  if (profile.length > 0) {
    context.profile = profile;
  }

  if (args["connect-timeout"] !== undefined) {
    context.connectTimeoutMs = parseTimeoutSeconds(args["connect-timeout"], "--connect-timeout");
  }
  if (args["read-timeout"] !== undefined) {
    context.readTimeoutMs = parseTimeoutSeconds(args["read-timeout"], "--read-timeout");
  }

  return context;
}
