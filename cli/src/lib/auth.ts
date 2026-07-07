import { configGet } from "@/lib/config.ts";
import { CliError, ConfigurationError, EXIT_CONFIG } from "@/lib/errors.ts";
import { secretGet } from "@/lib/secrets.ts";

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

export function getLakehouseAuthHeader(): string {
  const envToken = process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  if (envToken) {
    return `Authorization: Basic ${envToken}`;
  }

  const envUser = process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  const envPassword = process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
  if (envUser && envPassword) {
    const token = Buffer.from(`${envUser}:${envPassword}`).toString("base64");
    return `Authorization: Basic ${token}`;
  }

  if (!storedLakehouseCredentialsExpired()) {
    const storedToken = secretGet("lakehouse/basic-token");
    if (storedToken) {
      return `Authorization: Basic ${storedToken}`;
    }

    const user = configGet("user");
    const password = secretGet("lakehouse/password");
    if (user && password) {
      const token = Buffer.from(`${user}:${password}`).toString("base64");
      return `Authorization: Basic ${token}`;
    }
  }

  throw new ConfigurationError(
    "No credentials. Run 'altertable configure' or set ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD (or ALTERTABLE_BASIC_AUTH_TOKEN).",
  );
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
