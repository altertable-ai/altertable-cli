import { ConfigurationError } from "@/lib/errors.ts";

export type DeclaredAppScope = { organization: string; environment: string };

type Token = { kind: "identifier" | "string" | "punctuator" | "operand"; value: string };

/** Scope is a literal so preview can refuse a profile mismatch before querying. */
export function readDeclaredAppScope(source: string): DeclaredAppScope {
  const tokens = tokenize(transpile(source)).tokens;
  const scope = objectProperties(tokens, dataAppConfig(tokens)).get("scope");
  const fields =
    scope !== undefined && tokens[scope]!.value === "{"
      ? objectProperties(tokens, scope)
      : new Map<string, number>();
  const organization = literalString(tokens, fields.get("organization"));
  const environment = literalString(tokens, fields.get("environment"));
  if (!organization?.trim() || !environment?.trim()) {
    throw new ConfigurationError(
      "The data app file must declare scope.organization and scope.environment as string literals.",
    );
  }
  return { organization, environment };
}

function literalString(tokens: Token[], index: number | undefined): string | undefined {
  if (index === undefined) return undefined;
  const token = tokens[index]!;
  const after = tokens[index + 1]?.value;
  return token.kind === "string" && (after === "," || after === "}") ? token.value : undefined;
}

/** Bun removes TypeScript and JSX, so the scanner only needs JavaScript's lexical grammar. */
function transpile(source: string): string {
  try {
    return new Bun.Transpiler({ loader: "tsx" }).transformSync(source);
  } catch (error) {
    throw new ConfigurationError("The data app file could not be parsed.", { cause: error });
  }
}

function dataAppConfig(tokens: Token[]): number {
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.value !== "defineDataApp" || tokens[index + 1]?.value !== "(") continue;
    if (tokens[index + 2]?.value !== "{") {
      throw new ConfigurationError("defineDataApp must be called with an object literal.");
    }
    return index + 2;
  }
  throw new ConfigurationError(
    "Could not find defineDataApp(...) in the data app file. Declare the app with defineDataApp({ scope: { organization, environment } }).",
  );
}

/** Maps each literal key of the object opening at `open` to the index of its value's first token. */
function objectProperties(tokens: Token[], open: number): Map<string, number> {
  const properties = new Map<string, number>();
  let index = open + 1;
  while (index < tokens.length && tokens[index]!.value !== "}") {
    const key = tokens[index]!;
    if ((key.kind === "identifier" || key.kind === "string") && tokens[index + 1]?.value === ":") {
      index += 2;
      properties.set(key.value, index);
    }
    let depth = 0;
    for (; index < tokens.length; index++) {
      const value = tokens[index]!.value;
      if (depth === 0 && (value === "," || value === "}")) break;
      if (value === "{" || value === "(" || value === "[") depth += 1;
      else if (value === "}" || value === ")" || value === "]") depth -= 1;
    }
    if (tokens[index]?.value === ",") index += 1;
  }
  return properties;
}

const regexKeywords = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

/** Templates and regexes are opaque operands. With `nested`, stops after the `}` closing `${`. */
function tokenize(source: string, start = 0, nested = false): { tokens: Token[]; end: number } {
  const tokens: Token[] = [];
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (/\s/.test(char)) {
      index += 1;
    } else if (char === "/" && next === "/") {
      const newline = source.indexOf("\n", index);
      index = newline < 0 ? source.length : newline + 1;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) throw new ConfigurationError("The data app file has an unterminated comment.");
      index = end + 2;
    } else if (char === "'" || char === '"') {
      const text = readString(source, index);
      tokens.push({ kind: "string", value: text.value });
      index = text.end;
    } else if (char === "`") {
      index = skipTemplate(source, index);
      tokens.push({ kind: "operand", value: "`" });
    } else if (char === "/" && startsRegex(tokens.at(-1))) {
      index = skipRegex(source, index);
      tokens.push({ kind: "operand", value: "/" });
    } else if (/[A-Za-z_$]/.test(char)) {
      const end = scan(source, index, /[\w$]/);
      tokens.push({ kind: "identifier", value: source.slice(index, end) });
      index = end;
    } else if (/\d/.test(char)) {
      const end = scan(source, index, /[\w.]/);
      tokens.push({ kind: "operand", value: source.slice(index, end) });
      index = end;
    } else {
      if (char === "}" && nested && depth === 0) return { tokens, end: index + 1 };
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      tokens.push({ kind: "punctuator", value: char });
      index += 1;
    }
  }
  if (nested) throw new ConfigurationError("The data app file has an unterminated template.");
  return { tokens, end: index };
}

function scan(source: string, index: number, pattern: RegExp): number {
  let end = index + 1;
  while (end < source.length && pattern.test(source[end]!)) end += 1;
  return end;
}

function startsRegex(previous: Token | undefined): boolean {
  if (previous === undefined) return true;
  if (previous.kind === "identifier") return regexKeywords.has(previous.value);
  return previous.kind === "punctuator" && !")]}".includes(previous.value);
}

function readString(source: string, start: number): { value: string; end: number } {
  const quote = source[start]!;
  let value = "";
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]!;
    if (char === quote) return { value, end: index + 1 };
    if (char === "\n") break;
    if (char !== "\\") {
      value += char;
      continue;
    }
    const escape = readEscape(source, index + 1);
    value += escape.value;
    index = escape.end - 1;
  }
  throw new ConfigurationError("The data app file has an unterminated string.");
}

const simpleEscapes: Record<string, string> = {
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "0": "\0",
  "\n": "",
};

function readEscape(source: string, index: number): { value: string; end: number } {
  const code = /^(?:x([\da-f]{2})|u([\da-f]{4})|u\{([\da-f]{1,6})\})/i.exec(
    source.slice(index, index + 10),
  );
  if (code) {
    const hex = code[1] ?? code[2] ?? code[3]!;
    return { value: String.fromCodePoint(Number.parseInt(hex, 16)), end: index + code[0].length };
  }
  const char = source[index] ?? "";
  return { value: simpleEscapes[char] ?? char, end: index + 1 };
}

function skipTemplate(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]!;
    if (char === "\\") index += 1;
    else if (char === "`") return index + 1;
    else if (char === "$" && source[index + 1] === "{") {
      index = tokenize(source, index + 2, true).end - 1;
    }
  }
  throw new ConfigurationError("The data app file has an unterminated template.");
}

function skipRegex(source: string, start: number): number {
  let inClass = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]!;
    if (char === "\\") index += 1;
    else if (char === "\n") break;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) return scan(source, index, /[a-z]/i);
  }
  throw new ConfigurationError("The data app file has an unterminated regular expression.");
}
