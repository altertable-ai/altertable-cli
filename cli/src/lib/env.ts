import { ConfigurationError } from "@/lib/errors.ts";

type EnvSource = Readonly<Record<string, string | undefined>>;

function optional(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

function oneOf<const TValue extends string>(
  values: readonly TValue[],
): (value: string | undefined, name: string) => TValue | undefined {
  return (value, name) => {
    const present = optional(value);
    if (present === undefined) {
      return undefined;
    }
    if (values.includes(present as TValue)) {
      return present as TValue;
    }
    throw invalidValue(name, present, `one of: ${values.join(", ")}`);
  };
}

function booleanValue(value: string | undefined, name: string): boolean | undefined {
  const present = optional(value)?.toLowerCase();
  if (present === undefined) {
    return undefined;
  }
  if (present === "1" || present === "true") {
    return true;
  }
  if (present === "0" || present === "false") {
    return false;
  }
  throw invalidValue(name, value ?? "", "true, false, 1, or 0");
}

function port(value: string | undefined, name: string): number | undefined {
  const present = optional(value);
  if (present === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(present)) {
    throw invalidValue(name, present, "an integer from 0 to 65535");
  }
  const parsed = Number(present);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw invalidValue(name, present, "an integer from 0 to 65535");
  }
  return parsed;
}

function invalidValue(name: string, value: string, expectation: string): ConfigurationError {
  return new ConfigurationError(
    `Invalid ${name} value ${JSON.stringify(value)}; expected ${expectation}.`,
  );
}

const ENV_SCHEMA = {
  ALTERTABLE_ALLOW_INSECURE_HTTP: { parse: booleanValue },
  ALTERTABLE_API_BASE: { parse: optional },
  ALTERTABLE_API_KEY: { parse: optional, secret: true },
  ALTERTABLE_BASIC_AUTH_TOKEN: { parse: optional, secret: true },
  ALTERTABLE_COLOR: { parse: oneOf(["auto", "always", "never"] as const) },
  ALTERTABLE_CONFIG_HOME: { parse: optional },
  ALTERTABLE_DOCKER_PASSWORD: { parse: optional, secret: true },
  ALTERTABLE_DOCKER_USER: { parse: optional },
  ALTERTABLE_ENV: { parse: optional },
  ALTERTABLE_HTTP_LOG: { parse: optional },
  ALTERTABLE_LAKEHOUSE_PASSWORD: { parse: optional, secret: true },
  ALTERTABLE_LAKEHOUSE_USERNAME: { parse: optional },
  ALTERTABLE_MANAGEMENT_API_BASE: { parse: optional },
  ALTERTABLE_MOCK_HTTP_FILE: { parse: optional },
  ALTERTABLE_MOCK_USERS: { parse: optional },
  ALTERTABLE_NO_UPDATE_CHECK: { parse: booleanValue },
  ALTERTABLE_OAUTH_CLIENT_ID: { parse: optional },
  ALTERTABLE_OAUTH_REDIRECT_PORT: { parse: port },
  ALTERTABLE_OAUTH_SCOPE: { parse: optional },
  ALTERTABLE_PROFILE: { parse: optional },
  ALTERTABLE_SECRET_BACKEND: { parse: oneOf(["file", "keychain"] as const) },
  ALTERTABLE_UPDATE_CHECK: {
    parse: oneOf(["0", "1", "false", "true", "never"] as const),
  },
  ALTERTABLE_UPDATE_GITHUB_REPO: { parse: optional },
  ALTERTABLE_UPDATE_INSTALL_METHOD: {
    parse: oneOf(["auto", "package-manager", "github-binary"] as const),
  },
  ALTERTABLE_UPDATE_INSTALLER: { parse: oneOf(["bun", "npm", "pnpm", "yarn"] as const) },
  ALTERTABLE_UPDATE_REGISTRY_URL: { parse: optional },
  ALTERTABLE_UPDATE_SOURCE: { parse: oneOf(["npm", "github"] as const) },
  BUN_INSTALL: { parse: optional },
  CI: { parse: optional },
  COLUMNS: { parse: optional },
  FORCE_COLOR: { parse: optional },
  GHOSTTY_RESOURCES_DIR: { parse: optional },
  HOME: { parse: optional },
  NO_COLOR: { parse: optional },
  OSC_HYPERLINK: { parse: optional },
  SHELL: { parse: optional },
  SSH_CONNECTION: { parse: optional },
  TERM: { parse: optional },
  TERM_PROGRAM: { parse: optional },
  TEST: { parse: optional },
  WT_SESSION: { parse: optional },
  XDG_CONFIG_HOME: { parse: optional },
  XDG_DATA_HOME: { parse: optional },
  npm_config_user_agent: { parse: optional },
} as const;

const SECRET_NAME_PATTERN = /_(?:KEY|PASSWORD|SECRET|TOKEN)$/;

export function assertSecretEnvMetadata<TSchema extends Readonly<Record<string, object>>>(
  schema: TSchema,
): void {
  const missing = Object.entries(schema)
    .filter(
      ([name, definition]) =>
        SECRET_NAME_PATTERN.test(name) &&
        (definition as { readonly secret?: boolean }).secret !== true,
    )
    .map(([name]) => name)
    .sort();
  if (missing.length > 0) {
    throw new Error(
      `Secret environment variables must declare secret: true: ${missing.join(", ")}`,
    );
  }
}

assertSecretEnvMetadata(ENV_SCHEMA);

export type EnvName = keyof typeof ENV_SCHEMA;
export type EnvValue<TName extends EnvName> = ReturnType<(typeof ENV_SCHEMA)[TName]["parse"]>;

export function readEnv<TName extends EnvName>(name: TName): EnvValue<TName> {
  return readEnvFrom(process.env, name);
}

export function readEnvFrom<TName extends EnvName>(
  source: EnvSource,
  name: TName,
): EnvValue<TName> {
  return ENV_SCHEMA[name].parse(source[name], name) as EnvValue<TName>;
}

export function setEnv<TName extends EnvName>(name: TName, value: string): void {
  ENV_SCHEMA[name].parse(value, name);
  process.env[name] = value;
}

export function unsetEnv(name: EnvName): void {
  delete process.env[name];
}

export function copyProcessEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

export function validateEnvironment(source: EnvSource = process.env): void {
  const knownNames = new Set<string>(Object.keys(ENV_SCHEMA));
  const unknownNames = Object.keys(source)
    .filter((name) => name.startsWith("ALTERTABLE_") && !knownNames.has(name))
    .sort();
  if (unknownNames.length > 0) {
    const noun = unknownNames.length === 1 ? "variable" : "variables";
    throw new ConfigurationError(
      `Unknown Altertable environment ${noun}: ${unknownNames.join(", ")}. Check the spelling against the documented ALTERTABLE_* variables.`,
    );
  }

  for (const name of Object.keys(ENV_SCHEMA) as EnvName[]) {
    if (name.startsWith("ALTERTABLE_")) {
      readEnvFrom(source, name);
    }
  }
}

export type ConfigEnvName =
  | "ALTERTABLE_API_KEY"
  | "ALTERTABLE_BASIC_AUTH_TOKEN"
  | "ALTERTABLE_LAKEHOUSE_USERNAME"
  | "ALTERTABLE_LAKEHOUSE_PASSWORD"
  | "ALTERTABLE_ENV"
  | "ALTERTABLE_API_BASE"
  | "ALTERTABLE_MANAGEMENT_API_BASE";

export const CONFIG_ENV_NAMES = [
  "ALTERTABLE_API_KEY",
  "ALTERTABLE_BASIC_AUTH_TOKEN",
  "ALTERTABLE_LAKEHOUSE_USERNAME",
  "ALTERTABLE_LAKEHOUSE_PASSWORD",
  "ALTERTABLE_ENV",
  "ALTERTABLE_API_BASE",
  "ALTERTABLE_MANAGEMENT_API_BASE",
] as const satisfies readonly ConfigEnvName[];

export function isSecretEnv(name: EnvName): boolean {
  return "secret" in ENV_SCHEMA[name] && ENV_SCHEMA[name].secret === true;
}
