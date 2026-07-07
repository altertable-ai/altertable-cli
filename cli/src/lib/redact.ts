// Substring patterns — a key is sensitive if it *contains* any of these (so
// "access_token"/"refresh_token"/"client_secret" are all covered, not just exact "token").
export const SENSITIVE_JSON_KEY_PATTERNS = new Set(["password", "secret", "token", "api_key"]);
export const MASKED_PASSWORD_PLACEHOLDER = "[MASKED]";

const PASSWORD_FIELD_PATTERN = /password\s*:\s*\S+/gi;

/** Replace password values in credential strings (e.g. requested_by) with a fixed placeholder. */
export function redactPasswordFieldInText(text: string): string {
  return text.replace(PASSWORD_FIELD_PATTERN, (match) => {
    const separatorIndex = match.search(/:/);
    const label = match.slice(0, separatorIndex + 1);
    return `${label} ${MASKED_PASSWORD_PLACEHOLDER}`;
  });
}

const BODY_MAX_LENGTH = 512;
const BODY_ELLIPSIS = "…";

function isSensitiveJsonKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const pattern of SENSITIVE_JSON_KEY_PATTERNS) {
    if (lower.includes(pattern)) {
      return true;
    }
  }
  return false;
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
