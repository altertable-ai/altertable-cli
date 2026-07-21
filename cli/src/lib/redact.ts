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

function jsonStringEnd(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === '"') {
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function jsonValueEnd(source: string, start: number): number {
  const first = source[start];
  if (first === '"') {
    return jsonStringEnd(source, start);
  }
  if (first !== "{" && first !== "[") {
    let index = start;
    while (index < source.length && !/[\s,}\]]/.test(source[index] ?? "")) {
      index += 1;
    }
    return index;
  }

  const closingCharacters = [first === "{" ? "}" : "]"];
  let index = start + 1;
  while (index < source.length && closingCharacters.length > 0) {
    const character = source[index];
    if (character === '"') {
      index = jsonStringEnd(source, index);
      continue;
    }
    if (character === "{") closingCharacters.push("}");
    if (character === "[") closingCharacters.push("]");
    if (character === closingCharacters.at(-1)) closingCharacters.pop();
    index += 1;
  }
  return index;
}

/** Redact sensitive object fields while preserving all non-sensitive JSON source lexemes. */
export function redactSensitiveJsonText(source: string): string {
  JSON.parse(source);
  let index = 0;

  function renderWhitespace(): string {
    const start = index;
    while (/\s/.test(source[index] ?? "")) index += 1;
    return source.slice(start, index);
  }

  function renderValue(redact: boolean): string {
    if (redact) {
      index = jsonValueEnd(source, index);
      return '"[REDACTED]"';
    }
    if (source[index] === "{") return renderObject();
    if (source[index] === "[") return renderArray();
    const end = jsonValueEnd(source, index);
    const rendered = source.slice(index, end);
    index = end;
    return rendered;
  }

  function renderObject(): string {
    let rendered = "{";
    index += 1;
    rendered += renderWhitespace();
    while (source[index] !== "}") {
      const keyStart = index;
      const keyEnd = jsonStringEnd(source, keyStart);
      const rawKey = source.slice(keyStart, keyEnd);
      const key = JSON.parse(rawKey) as string;
      rendered += rawKey;
      index = keyEnd;
      rendered += renderWhitespace();
      rendered += source[index] ?? "";
      index += 1;
      rendered += renderWhitespace();
      rendered += renderValue(isSensitiveJsonKey(key));
      rendered += renderWhitespace();
      if (source[index] === ",") {
        rendered += ",";
        index += 1;
        rendered += renderWhitespace();
      }
    }
    index += 1;
    return `${rendered}}`;
  }

  function renderArray(): string {
    let rendered = "[";
    index += 1;
    rendered += renderWhitespace();
    while (source[index] !== "]") {
      rendered += renderValue(false);
      rendered += renderWhitespace();
      if (source[index] === ",") {
        rendered += ",";
        index += 1;
        rendered += renderWhitespace();
      }
    }
    index += 1;
    return `${rendered}]`;
  }

  const leadingWhitespace = renderWhitespace();
  const rendered = renderValue(false);
  return leadingWhitespace + rendered + renderWhitespace();
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
