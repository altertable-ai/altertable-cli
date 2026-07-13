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
  allowInsecureHttp: { name: "ALTERTABLE_ALLOW_INSECURE_HTTP", parse: booleanValue },
  apiBase: { name: "ALTERTABLE_API_BASE", parse: optional },
  apiKey: { name: "ALTERTABLE_API_KEY", parse: optional, secret: true },
  basicAuthToken: { name: "ALTERTABLE_BASIC_AUTH_TOKEN", parse: optional, secret: true },
  color: { name: "ALTERTABLE_COLOR", parse: oneOf(["auto", "always", "never"] as const) },
  configHome: { name: "ALTERTABLE_CONFIG_HOME", parse: optional },
  dockerPassword: { name: "ALTERTABLE_DOCKER_PASSWORD", parse: optional, secret: true },
  dockerUser: { name: "ALTERTABLE_DOCKER_USER", parse: optional },
  environment: { name: "ALTERTABLE_ENV", parse: optional },
  httpLog: { name: "ALTERTABLE_HTTP_LOG", parse: optional },
  lakehousePassword: {
    name: "ALTERTABLE_LAKEHOUSE_PASSWORD",
    parse: optional,
    secret: true,
  },
  lakehouseUsername: { name: "ALTERTABLE_LAKEHOUSE_USERNAME", parse: optional },
  managementApiBase: { name: "ALTERTABLE_MANAGEMENT_API_BASE", parse: optional },
  mockHttpFile: { name: "ALTERTABLE_MOCK_HTTP_FILE", parse: optional },
  mockUsers: { name: "ALTERTABLE_MOCK_USERS", parse: optional },
  noUpdateCheck: { name: "ALTERTABLE_NO_UPDATE_CHECK", parse: booleanValue },
  oauthClientId: { name: "ALTERTABLE_OAUTH_CLIENT_ID", parse: optional },
  oauthRedirectPort: { name: "ALTERTABLE_OAUTH_REDIRECT_PORT", parse: port },
  oauthScope: { name: "ALTERTABLE_OAUTH_SCOPE", parse: optional },
  profile: { name: "ALTERTABLE_PROFILE", parse: optional },
  secretBackend: {
    name: "ALTERTABLE_SECRET_BACKEND",
    parse: oneOf(["file", "keychain"] as const),
  },
  updateCheck: {
    name: "ALTERTABLE_UPDATE_CHECK",
    parse: oneOf(["0", "1", "false", "true", "never"] as const),
  },
  updateGithubRepo: { name: "ALTERTABLE_UPDATE_GITHUB_REPO", parse: optional },
  updateInstallMethod: {
    name: "ALTERTABLE_UPDATE_INSTALL_METHOD",
    parse: oneOf(["auto", "package-manager", "github-binary"] as const),
  },
  updateInstaller: {
    name: "ALTERTABLE_UPDATE_INSTALLER",
    parse: oneOf(["bun", "npm", "pnpm", "yarn"] as const),
  },
  updateRegistryUrl: { name: "ALTERTABLE_UPDATE_REGISTRY_URL", parse: optional },
  updateSource: { name: "ALTERTABLE_UPDATE_SOURCE", parse: oneOf(["npm", "github"] as const) },
  bunInstall: { name: "BUN_INSTALL", parse: optional },
  ci: { name: "CI", parse: optional },
  columns: { name: "COLUMNS", parse: optional },
  forceColor: { name: "FORCE_COLOR", parse: optional },
  home: { name: "HOME", parse: optional },
  noColor: { name: "NO_COLOR", parse: optional },
  npmUserAgent: { name: "npm_config_user_agent", parse: optional },
  oscHyperlink: { name: "OSC_HYPERLINK", parse: optional },
  shell: { name: "SHELL", parse: optional },
  term: { name: "TERM", parse: optional },
  termProgram: { name: "TERM_PROGRAM", parse: optional },
  ghosttyResourcesDir: { name: "GHOSTTY_RESOURCES_DIR", parse: optional },
  sshConnection: { name: "SSH_CONNECTION", parse: optional },
  test: { name: "TEST", parse: optional },
  xdgConfigHome: { name: "XDG_CONFIG_HOME", parse: optional },
  xdgDataHome: { name: "XDG_DATA_HOME", parse: optional },
  wtSession: { name: "WT_SESSION", parse: optional },
} as const;

export type EnvKey = keyof typeof ENV_SCHEMA;
export type EnvValue<TKey extends EnvKey> = ReturnType<(typeof ENV_SCHEMA)[TKey]["parse"]>;

export const Env = Object.freeze(
  Object.fromEntries(Object.entries(ENV_SCHEMA).map(([key, definition]) => [key, definition.name])),
) as { readonly [TKey in EnvKey]: (typeof ENV_SCHEMA)[TKey]["name"] };

export function readEnv<TKey extends EnvKey>(key: TKey): EnvValue<TKey> {
  return readEnvFrom(process.env, key);
}

export function readEnvFrom<TKey extends EnvKey>(source: EnvSource, key: TKey): EnvValue<TKey> {
  const definition = ENV_SCHEMA[key];
  return definition.parse(source[definition.name], definition.name) as EnvValue<TKey>;
}

export function setEnv<TKey extends EnvKey>(key: TKey, value: string): void {
  const definition = ENV_SCHEMA[key];
  definition.parse(value, definition.name);
  process.env[definition.name] = value;
}

export function unsetEnv(key: EnvKey): void {
  delete process.env[ENV_SCHEMA[key].name];
}

export function copyProcessEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

export function validateEnvironment(source: EnvSource = process.env): void {
  const knownNames = new Set<string>(Object.values(Env));
  const unknownNames = Object.keys(source)
    .filter((name) => name.startsWith("ALTERTABLE_") && !knownNames.has(name))
    .sort();
  if (unknownNames.length === 0) {
    for (const definition of Object.values(ENV_SCHEMA)) {
      if (definition.name.startsWith("ALTERTABLE_")) {
        definition.parse(source[definition.name], definition.name);
      }
    }
    return;
  }

  const noun = unknownNames.length === 1 ? "variable" : "variables";
  throw new ConfigurationError(
    `Unknown Altertable environment ${noun}: ${unknownNames.join(", ")}. Check the spelling against the documented ALTERTABLE_* variables.`,
  );
}

export type ConfigEnvKey =
  | "apiKey"
  | "basicAuthToken"
  | "lakehouseUsername"
  | "lakehousePassword"
  | "environment"
  | "apiBase"
  | "managementApiBase";

export const CONFIG_ENV_KEYS = [
  "apiKey",
  "basicAuthToken",
  "lakehouseUsername",
  "lakehousePassword",
  "environment",
  "apiBase",
  "managementApiBase",
] as const satisfies readonly ConfigEnvKey[];

export function isSecretEnv(key: ConfigEnvKey): boolean {
  return "secret" in ENV_SCHEMA[key] && ENV_SCHEMA[key].secret === true;
}
