import { CliError } from "@/lib/errors.ts";
import { defineArgs } from "@/lib/command.ts";

export const requestReadTimeoutArgs = defineArgs({
  "read-timeout": {
    type: "string",
    description: "Read timeout in seconds for this request (overrides global --read-timeout)",
  },
});

export function parseTimeoutSeconds(value: unknown, flagName: string): number {
  const text = String(value).trim();
  const parsedSeconds = Number.parseInt(text, 10);
  if (Number.isNaN(parsedSeconds) || parsedSeconds < 0 || String(parsedSeconds) !== text) {
    throw new CliError(`Invalid ${flagName}: must be a non-negative integer (seconds).`);
  }
  return parsedSeconds * 1_000;
}

export function readArgvFlagValue(argv: readonly string[], flagName: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === flagName) {
      return argv[index + 1];
    }
    if (arg.startsWith(`${flagName}=`)) {
      return arg.slice(flagName.length + 1);
    }
  }
  return undefined;
}

export function parseRequestReadTimeoutMs(args: Record<string, unknown>): number | undefined {
  if (args["read-timeout"] === undefined) return undefined;
  return parseTimeoutSeconds(args["read-timeout"], "--read-timeout");
}
