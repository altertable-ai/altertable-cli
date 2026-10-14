import { ConfigurationError } from "@/lib/errors.ts";

const literalScopeMessage =
  "The data app file must declare scope.organization and scope.environment as string literals.";

type DeclaredAppScope = { organization: string; environment: string };

type Token = { kind: "identifier" | "string" | "punctuation" | "expression"; value: string };

/** Scope is a literal so preview can refuse a profile mismatch before querying. */
export function readDeclaredAppScope(source: string): DeclaredAppScope {
  const tokens = tokenize(transpileAppSource(source)).tokens;
  const configuration = findAppConfiguration(tokens);
  const scope = readObjectProperties(tokens, configuration).get("scope");
  if (scope === undefined || tokens[scope]!.value !== "{")
    throw new ConfigurationError(literalScopeMessage);
  const fields = readObjectProperties(tokens, scope);
  const organization = readStringLiteral(tokens, fields.get("organization"));
  const environment = readStringLiteral(tokens, fields.get("environment"));
  if (!organization?.trim() || !environment?.trim()) {
    throw new ConfigurationError(literalScopeMessage);
  }
  return { organization, environment };
}

function readStringLiteral(tokens: Token[], index: number | undefined): string | undefined {
  if (index === undefined) return undefined;
  const token = tokens[index]!;
  const after = tokens[index + 1]?.value;
  return token.kind === "string" && (after === "," || after === "}") ? token.value : undefined;
}

/** Let Bun parse TypeScript and JSX; inspect its output without executing app code. */
function transpileAppSource(source: string): string {
  try {
    return new Bun.Transpiler({ loader: "tsx" }).transformSync(source);
  } catch (error) {
    throw new ConfigurationError("The data app file could not be parsed.", { cause: error });
  }
}

function findAppConfiguration(tokens: Token[]): number {
  const bindings = appDeclarationBindings(tokens);
  let configuration: number | undefined;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (
      token.kind !== "identifier" ||
      !bindings.has(token.value) ||
      tokens[index - 1]?.value === "." ||
      tokens[index + 1]?.value !== "("
    )
      continue;
    if (tokens[index + 2]?.value !== "{") {
      throw new ConfigurationError("defineDataApp must be called with an object literal.");
    }
    if (configuration !== undefined) {
      throw new ConfigurationError(
        "The data app file must contain exactly one defineDataApp declaration.",
      );
    }
    configuration = index + 2;
  }
  if (configuration === undefined) {
    throw new ConfigurationError(
      "Could not find defineDataApp(...) in the data app file. Declare the app with defineDataApp({ scope: { organization, environment } }).",
    );
  }
  return configuration;
}

/** Resolve the public named import, including aliases, without evaluating app source. */
function appDeclarationBindings(tokens: Token[]): Set<string> {
  const bindings = new Set<string>();
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]?.value !== "import" || tokens[index + 1]?.value !== "{") continue;
    const start = index + 2;
    let end = start;
    while (end < tokens.length && tokens[end]?.value !== "}") end++;
    if (
      tokens[end + 1]?.value !== "from" ||
      tokens[end + 2]?.kind !== "string" ||
      tokens[end + 2]?.value !== "@altertable/data-app"
    )
      continue;
    for (let specifier = start; specifier < end; specifier++) {
      if (
        tokens[specifier]?.value !== "defineDataApp" ||
        (specifier !== start && tokens[specifier - 1]?.value !== ",")
      )
        continue;
      const alias = tokens[specifier + 1]?.value === "as";
      const binding = tokens[specifier + (alias ? 2 : 0)];
      if (binding?.kind === "identifier") bindings.add(binding.value);
    }
  }
  return bindings;
}

/** Maps each literal key of the object opening at `open` to the index of its value's first token. */
function readObjectProperties(tokens: Token[], open: number): Map<string, number> {
  const properties = new Map<string, number>();
  let index = open + 1;
  while (index < tokens.length && tokens[index]!.value !== "}") {
    const key = tokens[index]!;
    if (key.kind !== "identifier" && key.kind !== "string") {
      throw new ConfigurationError(
        "Data app configuration and scope must use literal property names without spreads or computed keys.",
      );
    }
    if (properties.has(key.value)) {
      throw new ConfigurationError(`Duplicate data app property: ${key.value}.`);
    }
    const next = tokens[index + 1]?.value;
    if (next === ":") {
      index += 2;
      properties.set(key.value, index);
    } else if (key.kind === "identifier" && (next === "," || next === "}")) {
      properties.set(key.value, index);
    } else {
      throw new ConfigurationError(
        "Data app configuration and scope must declare data properties, not methods or getters.",
      );
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

const regexPrefixKeywords = new Set([
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

/** Templates and regexes are opaque expressions. With `nested`, stops after the `}` closing `${`. */
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
      tokens.push({ kind: "expression", value: "`" });
    } else if (char === "/" && canStartRegex(tokens.at(-1))) {
      index = skipRegex(source, index);
      tokens.push({ kind: "expression", value: "/" });
    } else if (/[A-Za-z_$]/.test(char)) {
      const end = scanTokenEnd(source, index, /[\w$]/);
      tokens.push({ kind: "identifier", value: source.slice(index, end) });
      index = end;
    } else if (/\d/.test(char)) {
      const end = scanTokenEnd(source, index, /[\w.]/);
      tokens.push({ kind: "expression", value: source.slice(index, end) });
      index = end;
    } else {
      if (char === "}" && nested && depth === 0) return { tokens, end: index + 1 };
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      tokens.push({ kind: "punctuation", value: char });
      index += 1;
    }
  }
  if (nested) throw new ConfigurationError("The data app file has an unterminated template.");
  return { tokens, end: index };
}

function scanTokenEnd(source: string, index: number, pattern: RegExp): number {
  let end = index + 1;
  while (end < source.length && pattern.test(source[end]!)) end += 1;
  return end;
}

function canStartRegex(previous: Token | undefined): boolean {
  if (previous === undefined) return true;
  if (previous.kind === "identifier") return regexPrefixKeywords.has(previous.value);
  return previous.kind === "punctuation" && !")]}".includes(previous.value);
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
    else if (char === "/" && !inClass) return scanTokenEnd(source, index, /[a-z]/i);
  }
  throw new ConfigurationError("The data app file has an unterminated regular expression.");
}
