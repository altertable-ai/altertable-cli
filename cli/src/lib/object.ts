export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function objectKeys<TValue extends Record<string, unknown>>(
  value: TValue,
): Array<Extract<keyof TValue, string>> {
  return Object.keys(value) as Array<Extract<keyof TValue, string>>;
}

export function hasObjectKey<TValue extends Record<string, unknown>>(
  value: TValue,
  key: string,
): key is Extract<keyof TValue, string> {
  return key in value;
}
