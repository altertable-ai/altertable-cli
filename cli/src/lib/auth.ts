import { configGet } from "@/lib/config.ts";
import { getCliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { secretGet } from "@/lib/secrets.ts";

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

  throw new ConfigurationError(
    "No credentials. Run 'altertable configure' or set ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD (or ALTERTABLE_BASIC_AUTH_TOKEN).",
  );
}

export function getManagementAuthHeader(): string {
  let key = process.env.ALTERTABLE_API_KEY ?? "";
  if (!key) {
    key = secretGet("api-key");
  }
  if (!key) {
    throw new ConfigurationError(
      "No management API key. Run 'altertable configure --api-key atm_xxx --env <name>' or set ALTERTABLE_API_KEY.",
    );
  }
  return `Authorization: Bearer ${key}`;
}

function managementEnv(): string {
  return getCliContext().environment ?? process.env.ALTERTABLE_ENV ?? configGet("api_key_env");
}

export function requireManagementEnv(): string {
  const env = managementEnv();
  if (!env) {
    throw new ConfigurationError(
      "No environment set. Run 'altertable env use <name>', pass --env <name>, or set ALTERTABLE_ENV.",
    );
  }
  return env;
}
