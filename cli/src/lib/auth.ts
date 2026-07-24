import { configGet } from "@/lib/config.ts";
import { CliError, ConfigurationError, EXIT_CONFIG } from "@/lib/errors.ts";
import { optionalAuth } from "@/lib/execution-context.ts";
import { secretGet } from "@/lib/secrets.ts";
import { readEnv } from "@/lib/env.ts";
import { isFromEnvProfile } from "@/lib/profile-store.ts";

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

export type LakehouseCredential =
  | { kind: "basic-token"; token: string }
  | { kind: "user-password"; user: string; password: string };

export type LakehouseBasicAuthPair = { user: string; password: string };

function envLakehouseCredential(): LakehouseCredential | undefined {
  const envToken = readEnv("ALTERTABLE_BASIC_AUTH_TOKEN");
  if (envToken) {
    return { kind: "basic-token", token: envToken };
  }

  const envUser = readEnv("ALTERTABLE_LAKEHOUSE_USERNAME");
  const envPassword = readEnv("ALTERTABLE_LAKEHOUSE_PASSWORD");
  if (envUser && envPassword) {
    return { kind: "user-password", user: envUser, password: envPassword };
  }

  return undefined;
}

function storedLakehouseCredential(profileName: string): LakehouseCredential | undefined {
  if (storedLakehouseCredentialsExpired(profileName)) {
    return undefined;
  }

  const storedToken = secretGet("lakehouse/basic-token", profileName);
  if (storedToken) {
    return { kind: "basic-token", token: storedToken };
  }

  const user = configGet("user", profileName);
  const password = secretGet("lakehouse/password", profileName);
  if (user && password) {
    return { kind: "user-password", user, password };
  }

  return undefined;
}

export function hasLakehouseEnvCredentials(): boolean {
  return envLakehouseCredential() !== undefined;
}

export function resolveLakehouseCredential(profileName: string): LakehouseCredential {
  if (isFromEnvProfile(profileName)) {
    const credential = envLakehouseCredential();
    if (credential) {
      return credential;
    }
    throw new ConfigurationError(
      "No lakehouse credentials in the environment configuration. Set ALTERTABLE_BASIC_AUTH_TOKEN or ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD, or unset the ALTERTABLE_* configuration variables to use a stored profile.",
    );
  }

  const credential = storedLakehouseCredential(profileName);
  if (credential) {
    return credential;
  }
  throw new ConfigurationError(
    "No credentials. Run 'altertable login', 'altertable profile configure', or set ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD (or ALTERTABLE_BASIC_AUTH_TOKEN).",
  );
}

export function getLakehouseAuthHeader(profileName: string): string {
  const credential = resolveLakehouseCredential(profileName);
  return credential.kind === "basic-token"
    ? basicAuthHeader(credential.token)
    : basicAuthHeader(basicAuthToken(credential.user, credential.password));
}

function decodeBasicToken(token: string): LakehouseBasicAuthPair | undefined {
  const decoded = Buffer.from(token, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1) {
    return undefined;
  }
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

export function getLakehouseCredentialPair(profileName: string): LakehouseBasicAuthPair {
  const credential = resolveLakehouseCredential(profileName);
  if (credential.kind === "user-password") {
    return { user: credential.user, password: credential.password };
  }
  const decoded = decodeBasicToken(credential.token);
  if (!decoded) {
    throw new ConfigurationError(
      "The configured lakehouse basic token does not decode to user:password credentials. Provide a username and password instead (ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD or 'altertable profile configure --user <u> --password <p>').",
    );
  }
  return decoded;
}

export function getManagementAuthHeader(profileName: string): string {
  if (isFromEnvProfile(profileName)) {
    const envKey = readEnv("ALTERTABLE_API_KEY") ?? "";
    if (envKey) {
      return `Authorization: Bearer ${envKey}`;
    }
    throw new ConfigurationError(
      "No management credentials in the environment configuration. Set ALTERTABLE_API_KEY, or unset the ALTERTABLE_* configuration variables to use a stored profile.",
    );
  }

  const oauthToken = secretGet("oauth/access-token", profileName);
  if (oauthToken) {
    return `Authorization: Bearer ${oauthToken}`;
  }

  const key = secretGet("api-key", profileName);
  if (!key) {
    throw new ConfigurationError(
      "No management credentials. Run 'altertable login', 'altertable profile configure --api-key atm_xxx --env <name>', or set ALTERTABLE_API_KEY.",
    );
  }
  return `Authorization: Bearer ${key}`;
}

export function requireManagementEnv(profileName: string): string {
  if (isFromEnvProfile(profileName)) {
    const env = readEnv("ALTERTABLE_ENV") ?? "";
    if (!env) {
      throw new ConfigurationError(
        "No environment set in the environment configuration. Set ALTERTABLE_ENV.",
      );
    }
    return env;
  }

  const env = configGet("api_key_env", profileName);
  if (!env) {
    throw new ConfigurationError(
      "No environment set. Run 'altertable profile configure --api-key atm_xxx --env <name>' or set ALTERTABLE_ENV.",
    );
  }
  return env;
}

export type ManagementPlaneRequirement = {
  requirement: string;
  alternative?: string;
};

export function requireManagementPlane(
  profileName: string,
  options: ManagementPlaneRequirement,
): string {
  const env = optionalAuth(() => requireManagementEnv(profileName));
  const credentialed = optionalAuth(() => getManagementAuthHeader(profileName)) !== undefined;
  if (env !== undefined && credentialed) {
    return env;
  }
  const remediation = isFromEnvProfile(profileName)
    ? "Set ALTERTABLE_API_KEY and ALTERTABLE_ENV"
    : "Run 'altertable login' or 'altertable profile configure --api-key atm_xxx --env <name>'";
  const alternative = options.alternative === undefined ? "" : `, or ${options.alternative}`;
  throw new ConfigurationError(
    `${options.requirement}, but the management plane is not configured. ${remediation}${alternative}.`,
  );
}
