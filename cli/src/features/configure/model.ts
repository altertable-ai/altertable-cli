import { configDir, configGet, resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import { getCliContext } from "@/context.ts";
import { getActiveProfileName } from "@/features/profile/model.ts";
import { secretStoreDisplay } from "@/lib/secrets.ts";
import { secretExists } from "@/lib/secrets.ts";

export type ConfigureCredentialStatus = {
  hasManagement: boolean;
  hasLakehouse: boolean;
};

export type ConfigurePlaneCredential = {
  configured: boolean;
  mechanism?:
    | "management_api_key"
    | "management_oauth"
    | "lakehouse_basic_token"
    | "lakehouse_username_password";
  source?: "stored" | "environment";
  environment?: string;
  user?: string;
  api_key?: "set";
  oauth?: "set";
  expires?: string;
  password?: "set";
  basic_token?: "set";
};

export type ConfigureShowOverrides = {
  environment?: string;
  stored_environment?: string | null;
  api_key?: boolean;
};

export type ConfigureShowData = {
  profile: string;
  config_dir: string;
  secret_store: string;
  data_plane: string;
  control_plane: string;
  credentials: {
    management: ConfigurePlaneCredential;
    lakehouse: ConfigurePlaneCredential;
  };
  overrides: ConfigureShowOverrides;
};

function hasEnvManagementCredentials(): boolean {
  return Boolean(process.env.ALTERTABLE_API_KEY);
}

function hasStoredManagementCredentials(): boolean {
  return secretExists("api-key");
}

function hasOAuthLogin(): boolean {
  return secretExists("oauth/access-token");
}

function hasEnvLakehouseCredentials(): boolean {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return true;
  }
  return Boolean(
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD,
  );
}

function hasStoredLakehouseCredentials(): boolean {
  return secretExists("lakehouse/basic-token") || secretExists("lakehouse/password");
}

export function configureCredentialStatus(): ConfigureCredentialStatus {
  return {
    hasManagement:
      hasStoredManagementCredentials() || hasEnvManagementCredentials() || hasOAuthLogin(),
    hasLakehouse: hasStoredLakehouseCredentials() || hasEnvLakehouseCredentials(),
  };
}

function buildManagementCredential(): ConfigurePlaneCredential {
  // Precedence mirrors getManagementAuthHeader: env key → OAuth login → stored key.
  if (hasEnvManagementCredentials()) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "environment",
      environment: process.env.ALTERTABLE_ENV ?? configGet("api_key_env") ?? undefined,
    };
  }
  if (hasOAuthLogin()) {
    return {
      configured: true,
      mechanism: "management_oauth",
      source: "stored",
      environment: configGet("api_key_env") || undefined,
      oauth: "set",
      expires: configGet("oauth_expiry") || undefined,
    };
  }
  if (hasStoredManagementCredentials()) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "stored",
      environment: configGet("api_key_env") || undefined,
      api_key: "set",
    };
  }
  return { configured: false };
}

function buildLakehouseCredential(): ConfigurePlaneCredential {
  if (hasStoredLakehouseCredentials()) {
    if (secretExists("lakehouse/basic-token")) {
      return {
        configured: true,
        mechanism: "lakehouse_basic_token",
        source: "stored",
        basic_token: "set",
        expires: configGet("lakehouse_credential_expiry") || undefined,
      };
    }
    return {
      configured: true,
      mechanism: "lakehouse_username_password",
      source: "stored",
      user: configGet("user") || undefined,
      password: "set",
    };
  }
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return {
      configured: true,
      mechanism: "lakehouse_basic_token",
      source: "environment",
    };
  }
  const envUser = process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  if (envUser && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD) {
    return {
      configured: true,
      mechanism: "lakehouse_username_password",
      source: "environment",
      user: envUser,
    };
  }
  return { configured: false };
}

function buildConfigureShowOverrides(): ConfigureShowOverrides {
  const overrides: ConfigureShowOverrides = {};
  const storedApiKeyEnv = configGet("api_key_env");
  const envOverride = process.env.ALTERTABLE_ENV;

  if (envOverride && envOverride !== storedApiKeyEnv) {
    overrides.environment = envOverride;
    overrides.stored_environment = storedApiKeyEnv || null;
  }
  if (process.env.ALTERTABLE_API_KEY && hasStoredManagementCredentials()) {
    overrides.api_key = true;
  }
  return overrides;
}

export function buildConfigureShowData(profileOverride?: string): ConfigureShowData {
  const activeProfile = getActiveProfileName();
  const displayProfile = profileOverride ?? getCliContext().profile ?? activeProfile;

  return {
    profile: displayProfile,
    config_dir: configDir(),
    secret_store: secretStoreDisplay(),
    data_plane: resolveApiBase(),
    control_plane: resolveManagementApiBase(),
    credentials: {
      management: buildManagementCredential(),
      lakehouse: buildLakehouseCredential(),
    },
    overrides: buildConfigureShowOverrides(),
  };
}

export function managementPlaneStatusDetail(): string | null {
  if (hasEnvManagementCredentials()) {
    return "via ALTERTABLE_API_KEY";
  }
  if (hasOAuthLogin()) {
    const env = configGet("api_key_env");
    return env ? `OAuth login (${env})` : "OAuth login";
  }
  if (!hasStoredManagementCredentials()) {
    return null;
  }
  return configGet("api_key_env") || "unknown";
}

export function lakehousePlaneStatusDetail(): string | null {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return "via ALTERTABLE_BASIC_AUTH_TOKEN";
  }
  const envUser = process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  if (envUser && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD) {
    return envUser;
  }
  if (!hasStoredLakehouseCredentials()) {
    return null;
  }
  if (secretExists("lakehouse/basic-token")) {
    return "basic token";
  }
  return configGet("user") || "unknown";
}
