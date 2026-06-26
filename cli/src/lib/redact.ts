export const SENSITIVE_JSON_KEYS = new Set(["password", "secret", "token", "api_key"]);

const BODY_MAX_LENGTH = 512;
const BODY_ELLIPSIS = "…";

function isSensitiveJsonKey(key: string): boolean {
  return SENSITIVE_JSON_KEYS.has(key.toLowerCase());
}

export function redactSensitiveJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveJsonValue);
  }
  if (typeof value === "object" && value !== null) {
    const redacted: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      redacted[key] = isSensitiveJsonKey(key) ? "[REDACTED]" : redactSensitiveJsonValue(entryValue);
    }
    return redacted;
  }
  return value;
}

export function truncateBodySnippet(body: string, maxLength = BODY_MAX_LENGTH): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}${BODY_ELLIPSIS}`;
}

export function redactSensitiveJsonString(body: string): string {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(body) as unknown;
      return JSON.stringify(redactSensitiveJsonValue(parsed));
    } catch {
      // fall through to truncation
    }
  }
  return truncateBodySnippet(body);
}

export function redactResponseBodyForDebug(body: string): string {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(body) as unknown;
      return JSON.stringify(redactSensitiveJsonValue(parsed), null, 2);
    } catch {
      // fall through to truncation
    }
  }
  return truncateBodySnippet(body);
}
