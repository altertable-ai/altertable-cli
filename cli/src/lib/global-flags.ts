import type { CliContext } from "@/context.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { parseTimeoutSeconds, readArgvFlagValue } from "@/lib/timeout-args.ts";

const GLOBAL_ARGV_FLAGS_WITH_VALUE = new Set([
  "--org",
  "--env",
  "--connect-timeout",
  "--read-timeout",
]);

function findFirstSubcommandIndex(argv: readonly string[]): number {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith("-")) {
      return index;
    }
    if (GLOBAL_ARGV_FLAGS_WITH_VALUE.has(arg)) {
      index += 1;
    }
  }
  return argv.length;
}

function readGlobalArgvFlagValue(argv: readonly string[], flagName: string): string | undefined {
  const subcommandIndex = findFirstSubcommandIndex(argv);
  return readArgvFlagValue(argv.slice(0, subcommandIndex), flagName);
}

export function parseGlobalFlags(argv: readonly string[]): CliContext {
  const context: CliContext = {
    debug: argv.includes("--debug") || argv.includes("-d"),
    json: argv.includes("--json"),
    agent: argv.includes("--agent"),
    noColor: argv.includes("--no-color"),
  };

  const connectTimeout = readGlobalArgvFlagValue(argv, "--connect-timeout");
  if (connectTimeout !== undefined) {
    context.connectTimeoutMs = parseTimeoutSeconds(connectTimeout, "--connect-timeout");
  }

  const readTimeout = readGlobalArgvFlagValue(argv, "--read-timeout");
  if (readTimeout !== undefined) {
    context.readTimeoutMs = parseTimeoutSeconds(readTimeout, "--read-timeout");
  }

  const org = readGlobalArgvFlagValue(argv, "--org");
  if (org !== undefined && org.length > 0) {
    context.profile = org;
  }

  const env = readGlobalArgvFlagValue(argv, "--env");
  if (env !== undefined && env.length > 0) {
    context.environment = env;
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

  const org = asCliArgString(args.org);
  if (org.length > 0) {
    context.profile = org;
  }

  const env = asCliArgString(args.env);
  if (env.length > 0) {
    context.environment = env;
  }

  if (args["connect-timeout"] !== undefined) {
    context.connectTimeoutMs = parseTimeoutSeconds(args["connect-timeout"], "--connect-timeout");
  }
  if (args["read-timeout"] !== undefined) {
    context.readTimeoutMs = parseTimeoutSeconds(args["read-timeout"], "--read-timeout");
  }

  return context;
}
