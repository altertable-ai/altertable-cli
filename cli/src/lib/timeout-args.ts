import { CliError } from "@/lib/errors.ts";

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
