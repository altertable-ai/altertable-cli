import { renameSync, rmSync } from "node:fs";
import {
  configDir,
  configGet,
  configSet,
  resolveApiBase,
  resolveManagementApiBase,
} from "@/lib/config.ts";
import { getCliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import type { WhoamiResponse } from "@/features/management/model.ts";
import {
  moveProfileSecrets,
  secretDelete,
  secretExists,
  secretStoreDisplay,
} from "@/lib/secrets.ts";
import {
  assertSafeProfileName,
  DEFAULT_PROFILE_NAME,
  envConfigMode,
  FROM_ENV_PSEUDOPROFILE_NAME,
  isFromEnvProfile,
  type ProfileConfigKey,
  ensureProfileExists,
  ensureProfilesLayout,
  getActiveProfileName,
  listProfileNames,
  profileConfigFile,
  profileDir,
  profileExists,
  readProfileConfigRecord,
  resolveWorkingProfile,
  setActiveProfile,
} from "@/lib/profile-store.ts";

export {
  assertSafeProfileName,
  DEFAULT_PROFILE_NAME,
  ensureProfileExists,
  ensureProfilesLayout,
  envConfigMode,
  FROM_ENV_PSEUDOPROFILE_NAME,
  getActiveProfileName,
  isFromEnvProfile,
  profileConfigFile,
  profileExists,
  profilesDir,
  readProfileConfigRecord,
  resolveWorkingProfile,
  setActiveProfile,
} from "@/lib/profile-store.ts";

const PROFILE_SECRET_ACCOUNTS = [
  "api-key",
  "lakehouse/password",
  "lakehouse/basic-token",
  "oauth/access-token",
  "oauth/refresh-token",
] as const;

type ProfileManagementAuth = "oauth" | "api_key" | "none";
type ProfileLakehouseAuth = "basic_token" | "username_password" | "none";
type ProfileAuth = {
  management: ProfileManagementAuth;
  lakehouse: ProfileLakehouseAuth;
};

export type ProfileSummary = {
  name: string;
  active: boolean;
  organization?: string;
  management_env?: string;
  principal?: string;
  management_auth?: string;
  lakehouse_auth?: string;
  oauth_expires_at?: string;
  status?: string;
  data_plane?: string;
  control_plane?: string;
};

export type ProfileUpdate = {
  organizationSlug?: string;
  organizationName?: string;
  principalType?: string;
  principalName?: string;
  principalEmail?: string;
  principalSlug?: string;
  environment?: string;
  dataPlane?: string;
  controlPlane?: string;
};

export type ProfileInspect = {
  name: string;
  active: boolean;
  config_file: string;
  organization: {
    slug?: string;
    name?: string;
  };
  principal: {
    type?: string;
    name?: string;
    email?: string;
    slug?: string;
  };
  environment?: string;
  endpoints: {
    data_plane?: string;
    control_plane?: string;
  };
  auth: ProfileAuth;
  status: "configured" | "partial" | "empty";
  timestamps: {
    created_at?: string;
    updated_at?: string;
    last_verified_at?: string;
    oauth_expires_at?: string;
    lakehouse_expires_at?: string;
  };
};

type ProfileSnapshot = {
  config: Record<ProfileConfigKey, string | undefined>;
  auth: ProfileAuth;
};

const PROFILE_UPDATE_CONFIG_KEYS = {
  organizationSlug: "organization_slug",
  organizationName: "organization_name",
  principalType: "principal_type",
  principalName: "principal_name",
  principalEmail: "principal_email",
  principalSlug: "principal_slug",
  environment: "api_key_env",
  dataPlane: "api_base",
  controlPlane: "management_api_base",
} as const satisfies Record<keyof ProfileUpdate, ProfileConfigKey>;

const MANAGEMENT_AUTH_LABELS = {
  oauth: "oauth",
  api_key: "api-key",
  none: "none",
} as const satisfies Record<ProfileManagementAuth, string>;

const LAKEHOUSE_AUTH_LABELS = {
  basic_token: "basic",
  username_password: "user/pass",
  none: "none",
} as const satisfies Record<ProfileLakehouseAuth, string>;

const PROFILE_NAME_PART_PATTERN = /[^a-z0-9._-]+/g;
const PROFILE_NAME_SEPARATOR_PATTERN = /[._-]{2,}/g;

function normalizeProfileNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(PROFILE_NAME_PART_PATTERN, "-")
    .replace(PROFILE_NAME_SEPARATOR_PATTERN, "-")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
}

export function deriveProfileName(org: string, env: string): string {
  const orgPart = normalizeProfileNamePart(org);
  const envPart = normalizeProfileNamePart(env);
  if (!orgPart || !envPart) {
    throw new ConfigurationError(
      "Profile auto-naming requires non-empty organization and environment values.",
    );
  }
  const profileName = `${orgPart}_${envPart}`;
  assertSafeProfileName(profileName);
  return profileName;
}

function nowIso(): string {
  return new Date().toISOString();
}

function writeProfileUpdate(name: string, update: ProfileUpdate): void {
  for (const profileField of Object.keys(PROFILE_UPDATE_CONFIG_KEYS) as Array<
    keyof ProfileUpdate
  >) {
    const value = update[profileField];
    if (value !== undefined) {
      configSet(PROFILE_UPDATE_CONFIG_KEYS[profileField], value, name);
    }
  }
}

function profileAuth(name: string): ProfileAuth {
  return {
    management: secretExists("oauth/access-token", name)
      ? "oauth"
      : secretExists("api-key", name)
        ? "api_key"
        : "none",
    lakehouse: secretExists("lakehouse/basic-token", name)
      ? "basic_token"
      : secretExists("lakehouse/password", name)
        ? "username_password"
        : "none",
  };
}

export function profileHasAnyAuthConfigured(name: string): boolean {
  const auth = profileAuth(name);
  return auth.management !== "none" || auth.lakehouse !== "none";
}

function readProfileSnapshot(name: string): ProfileSnapshot {
  return {
    config: readProfileConfigRecord(name),
    auth: profileAuth(name),
  };
}

function profileStatus(snapshot: ProfileSnapshot): ProfileInspect["status"] {
  const hasMetadata = Object.values(snapshot.config).some((value) => value !== undefined);
  const hasAnyAuth = snapshot.auth.management !== "none" || snapshot.auth.lakehouse !== "none";
  return hasAnyAuth ? "configured" : hasMetadata ? "partial" : "empty";
}

function profileManagementAuthSummary(auth: ProfileAuth): string {
  return MANAGEMENT_AUTH_LABELS[auth.management];
}

function profileLakehouseAuthSummary(auth: ProfileAuth): string {
  return LAKEHOUSE_AUTH_LABELS[auth.lakehouse];
}

function profilePrincipalSummary(
  config: Record<ProfileConfigKey, string | undefined>,
): string | undefined {
  if (config.principal_email) {
    return config.principal_email;
  }
  if (config.principal_slug) {
    return config.principal_slug;
  }
  return config.principal_name;
}

export function listProfiles(): ProfileSummary[] {
  ensureProfilesLayout();
  const active = getActiveProfileName();
  const names = listProfileNames();

  if (names.length === 0) {
    return [{ name: DEFAULT_PROFILE_NAME, active: active === DEFAULT_PROFILE_NAME }];
  }

  return names.map((name) => {
    const snapshot = readProfileSnapshot(name);
    return {
      name,
      active: name === active,
      organization: snapshot.config.organization_slug,
      management_env: snapshot.config.api_key_env,
      principal: profilePrincipalSummary(snapshot.config),
      management_auth: profileManagementAuthSummary(snapshot.auth),
      lakehouse_auth: profileLakehouseAuthSummary(snapshot.auth),
      oauth_expires_at: parseTimestampMs(snapshot.config.oauth_expiry),
      status: profileStatus(snapshot),
      data_plane: snapshot.config.api_base,
      control_plane: snapshot.config.management_api_base,
    };
  });
}

function parseTimestampMs(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const timestamp = Number.parseInt(raw, 10);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return new Date(timestamp).toISOString();
}

function envLakehouseAuthKind(): ProfileLakehouseAuth {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return "basic_token";
  }
  if (process.env.ALTERTABLE_LAKEHOUSE_USERNAME && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD) {
    return "username_password";
  }
  return "none";
}

// The `_from_env` identity has no stored directory, so build its inspection view
// from the environment variables in effect rather than reading disk.
function inspectFromEnvProfile(): ProfileInspect {
  const management: ProfileManagementAuth = hasEnvManagementCredentials() ? "api_key" : "none";
  const lakehouse = envLakehouseAuthKind();
  return {
    name: FROM_ENV_PSEUDOPROFILE_NAME,
    active: true,
    config_file: "environment variables",
    organization: {},
    principal: {},
    environment: process.env.ALTERTABLE_ENV || undefined,
    endpoints: {
      data_plane: process.env.ALTERTABLE_API_BASE || undefined,
      control_plane: process.env.ALTERTABLE_MANAGEMENT_API_BASE || undefined,
    },
    auth: { management, lakehouse },
    status: management !== "none" || lakehouse !== "none" ? "configured" : "empty",
    timestamps: {},
  };
}

export function inspectProfile(name: string): ProfileInspect {
  if (isFromEnvProfile(name)) {
    return inspectFromEnvProfile();
  }
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }

  const snapshot = readProfileSnapshot(name);
  const { config, auth } = snapshot;

  return {
    name,
    active: getActiveProfileName() === name,
    config_file: profileConfigFile(name),
    organization: {
      slug: config.organization_slug,
      name: config.organization_name,
    },
    principal: {
      type: config.principal_type,
      name: config.principal_name,
      email: config.principal_email,
      slug: config.principal_slug,
    },
    environment: config.api_key_env,
    endpoints: {
      data_plane: config.api_base,
      control_plane: config.management_api_base,
    },
    auth,
    status: profileStatus(snapshot),
    timestamps: {
      created_at: config.created_at,
      updated_at: config.updated_at,
      last_verified_at: config.last_verified_at,
      oauth_expires_at: parseTimestampMs(config.oauth_expiry),
      lakehouse_expires_at: parseTimestampMs(config.lakehouse_credential_expiry),
    },
  };
}

export function createEmptyProfile(name: string): ProfileInspect {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (profileExists(name)) {
    throw new ConfigurationError(`Profile already exists: ${name}`);
  }
  ensureProfileExists(name);
  const createdAt = nowIso();
  configSet("created_at", createdAt, name);
  configSet("updated_at", createdAt, name);
  return inspectProfile(name);
}

export function updateProfile(name: string, update: ProfileUpdate): ProfileInspect {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }
  writeProfileUpdate(name, update);
  configSet("updated_at", nowIso(), name);
  return inspectProfile(name);
}

export function renameProfile(source: string, target: string): void {
  assertSafeProfileName(source);
  assertSafeProfileName(target);
  ensureProfilesLayout();

  if (source === target) {
    return;
  }
  if (!profileExists(source)) {
    throw new ConfigurationError(`Profile not found: ${source}`);
  }
  if (profileExists(target)) {
    throw new ConfigurationError(`Profile already exists: ${target}`);
  }

  const active = getActiveProfileName();
  renameSync(profileDir(source), profileDir(target));
  try {
    moveProfileSecrets(source, target, [...PROFILE_SECRET_ACCOUNTS]);
  } catch (error) {
    if (profileExists(target) && !profileExists(source)) {
      renameSync(profileDir(target), profileDir(source));
    }
    throw error;
  }

  if (active === source) {
    setActiveProfile(target);
  }
}

export function deleteProfile(name: string): void {
  assertSafeProfileName(name);
  ensureProfilesLayout();

  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }

  const active = getActiveProfileName();
  if (name === active) {
    throw new ConfigurationError(
      `Cannot delete the active profile "${name}". Switch with: altertable profile use <name>`,
    );
  }

  for (const account of PROFILE_SECRET_ACCOUNTS) {
    secretDelete(account, name);
  }

  rmSync(profileDir(name), { recursive: true, force: true });
}

export type ConfigureCredentialStatus = {
  hasManagement: boolean;
  hasLakehouse: boolean;
};

type UnconfiguredCredential = {
  configured: false;
};

type ConfigureManagementApiKeyCredential = {
  configured: true;
  mechanism: "management_api_key";
  source?: "stored" | "environment";
  environment?: string;
  api_key?: "set";
};

type ConfigureManagementOAuthCredential = {
  configured: true;
  mechanism: "management_oauth";
  source: "stored";
  environment?: string;
  oauth?: "set";
  expires?: string;
};

export type ConfigureManagementCredential =
  | UnconfiguredCredential
  | ConfigureManagementApiKeyCredential
  | ConfigureManagementOAuthCredential;

type ConfigureLakehouseBasicTokenCredential = {
  configured: true;
  mechanism: "lakehouse_basic_token";
  source?: "stored" | "environment";
  basic_token?: "set";
  expires?: string;
};

type ConfigureLakehouseUsernamePasswordCredential = {
  configured: true;
  mechanism: "lakehouse_username_password";
  source?: "stored" | "environment";
  user?: string;
  password?: "set";
};

export type ConfigureLakehouseCredential =
  | UnconfiguredCredential
  | ConfigureLakehouseBasicTokenCredential
  | ConfigureLakehouseUsernamePasswordCredential;

export type ConfigureShowOverrides = {
  environment?: string;
  stored_environment?: string | null;
  api_key?: boolean;
};

export type ConfigureShowData = {
  profile: string;
  config_dir: string;
  config_file: string;
  secret_store: string;
  organization: {
    slug?: string;
    name?: string;
  };
  data_plane: string;
  control_plane: string;
  credentials: {
    management: ConfigureManagementCredential;
    lakehouse: ConfigureLakehouseCredential;
  };
  overrides: ConfigureShowOverrides;
};

function hasEnvManagementCredentials(): boolean {
  return Boolean(process.env.ALTERTABLE_API_KEY);
}

function hasStoredManagementCredentials(profileName: string): boolean {
  return secretExists("api-key", profileName);
}

function hasOAuthLogin(profileName: string): boolean {
  return secretExists("oauth/access-token", profileName);
}

function hasEnvLakehouseCredentials(): boolean {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return true;
  }
  return Boolean(
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD,
  );
}

function hasStoredLakehouseCredentials(profileName: string): boolean {
  return (
    secretExists("lakehouse/basic-token", profileName) ||
    secretExists("lakehouse/password", profileName)
  );
}

/**
 * The profile identity currently in effect. Normally the active stored profile,
 * but env configuration isolates the identity to the reserved `_from_env`
 * pseudo-profile (see `envConfigMode`).
 */
export function resolveActiveProfileName(): string {
  return resolveWorkingProfile(getCliContext().profile);
}

const ENV_CONFIG_VARS: ReadonlyArray<{ name: string; secret: boolean }> = [
  { name: "ALTERTABLE_API_KEY", secret: true },
  { name: "ALTERTABLE_BASIC_AUTH_TOKEN", secret: true },
  { name: "ALTERTABLE_LAKEHOUSE_USERNAME", secret: false },
  { name: "ALTERTABLE_LAKEHOUSE_PASSWORD", secret: true },
  { name: "ALTERTABLE_ENV", secret: false },
  { name: "ALTERTABLE_API_BASE", secret: false },
  { name: "ALTERTABLE_MANAGEMENT_API_BASE", secret: false },
];

/** The profile-configuring env vars currently set, with secrets masked. */
export function configuredEnvConfig(): Array<{ name: string; display: string }> {
  return ENV_CONFIG_VARS.flatMap(({ name, secret }) => {
    const value = process.env[name];
    if (!value) {
      return [];
    }
    return [{ name, display: secret ? "set (hidden)" : value }];
  });
}

/**
 * Guard for commands that mutate stored-profile state (login, switching,
 * create/delete/rename, configure). While the CLI is configured through
 * environment variables the active identity is the synthetic `_from_env`
 * profile — there is no stored profile to act on and the env vars would override
 * any change — so refuse and show what's configured.
 */
export function assertNoEnvConfigMode(): void {
  if (!envConfigMode()) {
    return;
  }
  const lines = configuredEnvConfig().map(({ name, display }) => `  ${name.padEnd(32)} ${display}`);
  throw new ConfigurationError(
    [
      "Profile management commands aren't available when configuring through environment variables.",
      "",
      "Currently configured:",
      ...lines,
    ].join("\n"),
  );
}

export function configureCredentialStatus(profileName: string): ConfigureCredentialStatus {
  return {
    hasManagement:
      hasStoredManagementCredentials(profileName) ||
      hasEnvManagementCredentials() ||
      hasOAuthLogin(profileName),
    hasLakehouse: hasStoredLakehouseCredentials(profileName) || hasEnvLakehouseCredentials(),
  };
}

function buildManagementCredential(profileName: string): ConfigureManagementCredential {
  // Precedence mirrors getManagementAuthHeader: env key → OAuth login → stored key.
  if (hasEnvManagementCredentials()) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "environment",
      environment: process.env.ALTERTABLE_ENV ?? configGet("api_key_env", profileName) ?? undefined,
    };
  }
  if (hasOAuthLogin(profileName)) {
    return {
      configured: true,
      mechanism: "management_oauth",
      source: "stored",
      environment: configGet("api_key_env", profileName) || undefined,
      oauth: "set",
      expires: configGet("oauth_expiry", profileName) || undefined,
    };
  }
  if (hasStoredManagementCredentials(profileName)) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "stored",
      environment: configGet("api_key_env", profileName) || undefined,
      api_key: "set",
    };
  }
  return { configured: false };
}

function buildLakehouseCredential(profileName: string): ConfigureLakehouseCredential {
  if (hasStoredLakehouseCredentials(profileName)) {
    if (secretExists("lakehouse/basic-token", profileName)) {
      return {
        configured: true,
        mechanism: "lakehouse_basic_token",
        source: "stored",
        basic_token: "set",
        expires: configGet("lakehouse_credential_expiry", profileName) || undefined,
      };
    }
    return {
      configured: true,
      mechanism: "lakehouse_username_password",
      source: "stored",
      user: configGet("user", profileName) || undefined,
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

function buildConfigureShowOverrides(profileName: string): ConfigureShowOverrides {
  const overrides: ConfigureShowOverrides = {};
  const storedApiKeyEnv = configGet("api_key_env", profileName);
  const envOverride = process.env.ALTERTABLE_ENV;

  if (envOverride && envOverride !== storedApiKeyEnv) {
    overrides.environment = envOverride;
    overrides.stored_environment = storedApiKeyEnv || null;
  }
  if (process.env.ALTERTABLE_API_KEY && hasStoredManagementCredentials(profileName)) {
    overrides.api_key = true;
  }
  return overrides;
}

export function buildConfigureShowData(profileName: string): ConfigureShowData {
  return {
    profile: profileName,
    config_dir: configDir(),
    config_file: profileConfigFile(profileName),
    secret_store: secretStoreDisplay(),
    organization: {
      slug: configGet("organization_slug", profileName) || undefined,
      name: configGet("organization_name", profileName) || undefined,
    },
    data_plane: resolveApiBase(profileName),
    control_plane: resolveManagementApiBase(profileName),
    credentials: {
      management: buildManagementCredential(profileName),
      lakehouse: buildLakehouseCredential(profileName),
    },
    overrides: buildConfigureShowOverrides(profileName),
  };
}

export function managementPlaneStatusDetail(profileName: string): string | null {
  if (hasEnvManagementCredentials()) {
    return "via ALTERTABLE_API_KEY";
  }
  if (hasOAuthLogin(profileName)) {
    const env = configGet("api_key_env", profileName);
    return env ? `OAuth login (${env})` : "OAuth login";
  }
  if (!hasStoredManagementCredentials(profileName)) {
    return null;
  }
  return configGet("api_key_env", profileName) || "unknown";
}

export function lakehousePlaneStatusDetail(profileName: string): string | null {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return "via ALTERTABLE_BASIC_AUTH_TOKEN";
  }
  const envUser = process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  if (envUser && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD) {
    return envUser;
  }
  if (!hasStoredLakehouseCredentials(profileName)) {
    return null;
  }
  if (secretExists("lakehouse/basic-token", profileName)) {
    return "basic token";
  }
  return configGet("user", profileName) || "unknown";
}

export type ActiveContext = {
  profile: string;
  environment?: string;
  data_plane: string;
  control_plane: string;
  management: string | null;
  lakehouse: string | null;
  credentialStatus: ReturnType<typeof configureCredentialStatus>;
  credentials: ConfigureShowData["credentials"];
  overrides: ConfigureShowData["overrides"];
  principal?: WhoamiResponse["principal"];
  organization?: WhoamiResponse["organization"];
};

function resolveEnvironment(showData: ConfigureShowData): string | undefined {
  const envOverride = process.env.ALTERTABLE_ENV;
  if (envOverride && envOverride.length > 0) {
    return envOverride;
  }
  const managementCredential = showData.credentials.management;
  return managementCredential.configured ? managementCredential.environment : undefined;
}

export function buildActiveContext(profileName: string): ActiveContext {
  ensureProfileExists(profileName);
  const showData = buildConfigureShowData(profileName);
  const credentialStatus = configureCredentialStatus(profileName);

  return {
    profile: showData.profile,
    environment: resolveEnvironment(showData),
    data_plane: showData.data_plane,
    control_plane: showData.control_plane,
    management: managementPlaneStatusDetail(profileName),
    lakehouse: lakehousePlaneStatusDetail(profileName),
    credentialStatus,
    credentials: showData.credentials,
    overrides: showData.overrides,
  };
}

export function withAuthenticatedIdentity(
  context: ActiveContext,
  whoami: WhoamiResponse,
): ActiveContext {
  return {
    ...context,
    principal: whoami.principal,
    organization: whoami.organization,
  };
}

export function activeContextToJson(context: ActiveContext): Record<string, unknown> {
  return {
    profile: context.profile,
    environment: context.environment ?? null,
    data_plane: context.data_plane,
    control_plane: context.control_plane,
    management: context.management,
    lakehouse: context.lakehouse,
    credentials: context.credentials,
    overrides: context.overrides,
    ...(context.principal !== undefined ? { principal: context.principal } : {}),
    ...(context.organization !== undefined ? { organization: context.organization } : {}),
  };
}
