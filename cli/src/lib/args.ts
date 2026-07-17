import { CliError } from "@/lib/errors.ts";

export type ParsedArgsRecord = Record<string, unknown>;

export function stringArg(args: ParsedArgsRecord, key: string): string {
  const value = args[key];
  if (typeof value === "string") {
    return value;
  }
  throw new CliError(`Missing required argument: ${key}.`);
}

export function optionalStringArg(args: ParsedArgsRecord, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function booleanArg(args: ParsedArgsRecord, key: string): boolean {
  return args[key] === true;
}

export function enumArg<const T extends readonly string[]>(
  args: ParsedArgsRecord,
  key: string,
  values: T,
): T[number] {
  const value = stringArg(args, key);
  if (values.includes(value)) {
    return value as T[number];
  }
  throw new CliError(`--${key} must be one of: ${values.join(", ")}.`);
}
