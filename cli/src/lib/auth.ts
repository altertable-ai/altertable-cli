import { configGet } from "@/lib/config.ts";
import { CliError, ConfigurationError, EXIT_CONFIG } from "@/lib/errors.ts";
import { secretGet } from "@/lib/secrets.ts";

export function basicAuthToken(user: string, password: string): string {
  return Buffer.from(`${user}:${password}`).toString("base64");
}

export function basicAuthHeader(token: string): string {
  return `Authorization: Basic ${token}`;
}

function storedLakehouseCredentialsExpired(profileName: string): boolean {
  const raw = configGet("lakehouse_credential_expiry", profileName);
  if (!raw) {
    return false;
  }
  // Plain CliError, not ConfigurationError: the optional-auth resolvers treat
  // ConfigurationError as "not configured" and would silently re-provision.
  const expiry = Number(raw);
  if (Number.isNaN(expiry)) {
    throw new CliError(
      "Stored lakehouse credential expiry is corrupted. Run 'altertable logout' and try again.",
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

export function getLakehouseAuthHeader(profileName: string): string {
  const envHeader = lakehouseEnvAuthHeader();
  if (envHeader) {
    return envHeader;
  }

  if (!storedLakehouseCredentialsExpired(profileName)) {
    const storedToken = secretGet("lakehouse/basic-token", profileName);
    if (storedToken) {
      return basicAuthHeader(storedToken);
    }

    const user = configGet("user", profileName);
    const password = secretGet("lakehouse/password", profileName);
    if (user && password) {
      return basicAuthHeader(basicAuthToken(user, password));
    }
  }

  throw new ConfigurationError(
    "No credentials. Run 'altertable login', 'altertable profile --configure', or set ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD (or ALTERTABLE_BASIC_AUTH_TOKEN).",
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

export function getLoginLakehouseCredentials(
  profileName: string,
): LakehouseCredentials | undefined {
  if (storedLakehouseCredentialsExpired(profileName)) {
    return undefined;
  }
  const token = secretGet("lakehouse/basic-token", profileName);
  return token ? decodeBasicToken(token) : undefined;
}

export function getManagementAuthHeader(profileName: string): string {
  const envKey = process.env.ALTERTABLE_API_KEY ?? "";
  if (envKey) {
    return `Authorization: Bearer ${envKey}`;
  }

  const oauthToken = secretGet("oauth/access-token", profileName);
  if (oauthToken) {
    return `Authorization: Bearer ${oauthToken}`;
  }

  const key = secretGet("api-key", profileName);
  if (!key) {
    throw new ConfigurationError(
      "No management credentials. Run 'altertable login', 'altertable profile --configure --api-key atm_xxx --env <name>', or set ALTERTABLE_API_KEY.",
    );
  }
  return `Authorization: Bearer ${key}`;
}

function managementEnv(profileName: string): string {
  return process.env.ALTERTABLE_ENV ?? configGet("api_key_env", profileName);
}

export function requireManagementEnv(profileName: string): string {
  const env = managementEnv(profileName);
  if (!env) {
    throw new ConfigurationError(
      "No environment set. Run 'altertable profile --configure --api-key atm_xxx --env <name>' or set ALTERTABLE_ENV.",
    );
  }
  return env;
}
