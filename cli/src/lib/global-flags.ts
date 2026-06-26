import type { CliContext } from "@/context.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { parseTimeoutSeconds, readArgvFlagValue } from "@/lib/timeout-args.ts";

export function parseGlobalFlags(argv: readonly string[]): CliContext {
  const context: CliContext = {
    debug: argv.includes("--debug") || argv.includes("-d"),
    json: argv.includes("--json"),
    agent: argv.includes("--agent"),
    noColor: argv.includes("--no-color"),
  };

  const connectTimeout = readArgvFlagValue(argv, "--connect-timeout");
  if (connectTimeout !== undefined) {
    context.connectTimeoutMs = parseTimeoutSeconds(connectTimeout, "--connect-timeout");
  }

  const readTimeout = readArgvFlagValue(argv, "--read-timeout");
  if (readTimeout !== undefined) {
    context.readTimeoutMs = parseTimeoutSeconds(readTimeout, "--read-timeout");
  }

  const profile = readArgvFlagValue(argv, "--profile");
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
