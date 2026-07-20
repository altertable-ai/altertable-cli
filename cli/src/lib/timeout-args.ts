import { CliError } from "@/lib/errors.ts";

export function parseTimeoutSeconds(value: unknown, flagName: string): number {
  const text = String(value).trim();
  const parsedSeconds = Number.parseInt(text, 10);
  if (Number.isNaN(parsedSeconds) || parsedSeconds < 0 || String(parsedSeconds) !== text) {
    throw new CliError(`Invalid ${flagName}: must be a non-negative integer (seconds).`);
  }
  return parsedSeconds * 1_000;
}
