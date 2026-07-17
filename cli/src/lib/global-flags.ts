import type { CliContext } from "@/context.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { parseTimeoutSeconds, readArgvFlagValue } from "@/lib/timeout-args.ts";

function readGlobalArgvFlagValue(argv: readonly string[], flagName: string): string | undefined {
  const separatorIndex = argv.indexOf("--");
  return readArgvFlagValue(separatorIndex === -1 ? argv : argv.slice(0, separatorIndex), flagName);
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

export function mergeGlobalFlagsFromArgs(
  context: CliContext,
  args: Record<string, unknown>,
): CliContext {
  const merged = { ...context };
  if (args.debug !== undefined) merged.debug = Boolean(args.debug);
  if (args.json !== undefined) merged.json = Boolean(args.json);
  if (args.agent !== undefined) merged.agent = Boolean(args.agent);
  if (args["no-color"] !== undefined) merged.noColor = Boolean(args["no-color"]);

  const profile = asCliArgString(args.profile);
  if (profile.length > 0) merged.profile = profile;
  if (args["connect-timeout"] !== undefined) {
    merged.connectTimeoutMs = parseTimeoutSeconds(args["connect-timeout"], "--connect-timeout");
  }
  if (args["read-timeout"] !== undefined) {
    merged.readTimeoutMs = parseTimeoutSeconds(args["read-timeout"], "--read-timeout");
  }
  return merged;
}
