/** Coerce a parsed CLI argument to string without unsafe object stringification. */
export function asCliArgString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}
