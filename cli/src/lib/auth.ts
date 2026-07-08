import { configGet } from "@/lib/config.ts";
import { CliError, ConfigurationError, EXIT_CONFIG } from "@/lib/errors.ts";
import { secretGet } from "@/lib/secrets.ts";

export function basicAuthToken(user: string, password: string): string {
  return Buffer.from(`${user}:${password}`).toString("base64");
}

export function basicAuthHeader(token: string): string {
  return `Authorization: Basic ${token}`;
}

function storedLakehouseCredentialsExpired(): boolean {
  const raw = configGet("lakehouse_credential_expiry");
  if (!raw) {
    return false;
  }
  // Plain CliError, not ConfigurationError: the optional-auth resolvers treat
  // ConfigurationError as "not configured" and would silently re-provision.
  const expiry = Number(raw);
  if (Number.isNaN(expiry)) {
    throw new CliError(
      "Stored lakehouse credential expiry is corrupted. Run 'altertable configure --clear' and try again.",
      { exitCode: EXIT_CONFIG },
    );
  }
  return Date.now() >= expiry;
}

function lakehouseEnvAuthHeader(): string | undefined {
  const envToken = process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  if (envToken) {
    return basicAuthHeader(envToken);
  }

  const envUser = process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  const envPassword = process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
  if (envUser && envPassword) {
    return basicAuthHeader(basicAuthToken(envUser, envPassword));
  }

  return undefined;
}

export function hasLakehouseEnvCredentials(): boolean {
  return lakehouseEnvAuthHeader() !== undefined;
}

export function getLakehouseAuthHeader(): string {
  const envHeader = lakehouseEnvAuthHeader();
  if (envHeader) {
    return envHeader;
  }

  if (!storedLakehouseCredentialsExpired()) {
    const storedToken = secretGet("lakehouse/basic-token");
    if (storedToken) {
      return basicAuthHeader(storedToken);
    }

    const user = configGet("user");
    const password = secretGet("lakehouse/password");
    if (user && password) {
      return basicAuthHeader(basicAuthToken(user, password));
    }
  }

  throw new ConfigurationError(
    "No credentials. Run 'altertable configure' or set ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD (or ALTERTABLE_BASIC_AUTH_TOKEN).",
  );
}

export type LakehouseCredentials = { user: string; password: string };

function decodeBasicToken(token: string): LakehouseCredentials | undefined {
  const decoded = Buffer.from(token, "base64").toString("utf8");
  const [user, password] = decoded.split(":");
  if (!user || !password) {
    return undefined;
  }
  return { user, password };
}

export function getLoginLakehouseCredentials(): LakehouseCredentials | undefined {
  if (storedLakehouseCredentialsExpired()) {
    return undefined;
  }
  const token = secretGet("lakehouse/basic-token");
  return token ? decodeBasicToken(token) : undefined;
}

export function getManagementAuthHeader(): string {
  const envKey = process.env.ALTERTABLE_API_KEY ?? "";
  if (envKey) {
    return `Authorization: Bearer ${envKey}`;
  }

  const oauthToken = secretGet("oauth/access-token");
  if (oauthToken) {
    return `Authorization: Bearer ${oauthToken}`;
  }

  const key = secretGet("api-key");
  if (!key) {
    throw new ConfigurationError(
      "No management credentials. Run 'altertable login', 'altertable configure --api-key atm_xxx --env <name>', or set ALTERTABLE_API_KEY.",
    );
  }
  return `Authorization: Bearer ${key}`;
}

function managementEnv(): string {
  return process.env.ALTERTABLE_ENV ?? configGet("api_key_env");
}

export function requireManagementEnv(): string {
  const env = managementEnv();
  if (!env) {
    throw new ConfigurationError(
      "No environment set. Run 'altertable configure --api-key atm_xxx --env <name>' or set ALTERTABLE_ENV.",
    );
  }
  return env;
}
