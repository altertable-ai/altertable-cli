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

class SourcePreservingJsonRedactor {
  private position = 0;

  constructor(private readonly source: string) {}

  redact(): string {
    const leadingWhitespace = this.takeWhitespace();
    const value = this.redactValue(false);
    return leadingWhitespace + value + this.takeWhitespace();
  }

  private takeWhitespace(): string {
    const start = this.position;
    while (/\s/.test(this.source[this.position] ?? "")) this.position += 1;
    return this.source.slice(start, this.position);
  }

  private redactValue(shouldRedact: boolean): string {
    if (shouldRedact) {
      this.position = this.findValueEnd(this.position);
      return '"[REDACTED]"';
    }
    if (this.source[this.position] === "{") return this.redactObject();
    if (this.source[this.position] === "[") return this.redactArray();

    const end = this.findValueEnd(this.position);
    const value = this.source.slice(this.position, end);
    this.position = end;
    return value;
  }

  private redactObject(): string {
    let output = "{";
    this.position += 1;
    output += this.takeWhitespace();

    while (this.source[this.position] !== "}") {
      const keyStart = this.position;
      const keyEnd = this.findStringEnd(keyStart);
      const rawKey = this.source.slice(keyStart, keyEnd);
      const key = JSON.parse(rawKey) as string;

      output += rawKey;
      this.position = keyEnd;
      output += this.takeWhitespace();
      output += this.source[this.position] ?? "";
      this.position += 1;
      output += this.takeWhitespace();
      output += this.redactValue(isSensitiveJsonKey(key));
      output += this.takeWhitespace();

      if (this.source[this.position] === ",") {
        output += ",";
        this.position += 1;
        output += this.takeWhitespace();
      }
    }

    this.position += 1;
    return `${output}}`;
  }

  private redactArray(): string {
    let output = "[";
    this.position += 1;
    output += this.takeWhitespace();

    while (this.source[this.position] !== "]") {
      output += this.redactValue(false);
      output += this.takeWhitespace();
      if (this.source[this.position] === ",") {
        output += ",";
        this.position += 1;
        output += this.takeWhitespace();
      }
    }

    this.position += 1;
    return `${output}]`;
  }

  private findStringEnd(start: number): number {
    let position = start + 1;
    while (position < this.source.length) {
      if (this.source[position] === "\\") {
        position += 2;
        continue;
      }
      if (this.source[position] === '"') return position + 1;
      position += 1;
    }
    return this.source.length;
  }

  private findValueEnd(start: number): number {
    const firstCharacter = this.source[start];
    if (firstCharacter === '"') return this.findStringEnd(start);
    if (firstCharacter !== "{" && firstCharacter !== "[") {
      let position = start;
      while (position < this.source.length && !/[\s,}\]]/.test(this.source[position] ?? "")) {
        position += 1;
      }
      return position;
    }

    const closingCharacters = [firstCharacter === "{" ? "}" : "]"];
    let position = start + 1;
    while (position < this.source.length && closingCharacters.length > 0) {
      const character = this.source[position];
      if (character === '"') {
        position = this.findStringEnd(position);
        continue;
      }
      if (character === "{") closingCharacters.push("}");
      if (character === "[") closingCharacters.push("]");
      if (character === closingCharacters.at(-1)) closingCharacters.pop();
      position += 1;
    }
    return position;
  }
}

/** Redact sensitive object fields while preserving all non-sensitive JSON source lexemes. */
export function redactSensitiveJsonText(source: string): string {
  JSON.parse(source);
  return new SourcePreservingJsonRedactor(source).redact();
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
