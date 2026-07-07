import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { configDir, configFile, kvGet, kvSet, kvUnset } from "@/lib/config.ts";
import { getCliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { PROFILE_CONFIG_KEYS, type ProfileConfigKey } from "@/lib/profile-config-keys.ts";
import { moveProfileSecrets, secretDelete, secretExists } from "@/lib/secrets.ts";
import { isCliRuntimeReady } from "@/lib/runtime.ts";

export const DEFAULT_PROFILE_NAME = "default";

const PROFILE_SECRET_ACCOUNTS = [
  "api-key",
  "lakehouse/password",
  "lakehouse/basic-token",
  "oauth/access-token",
  "oauth/refresh-token",
] as const;

const PROFILE_EXPORT_VERSION = 1;
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
  description?: string;
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
  description?: string;
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
  description?: string;
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

export type ProfileExport = {
  version: number;
  profile: {
    name: string;
    config: Record<ProfileConfigKey, string | undefined>;
  };
  secrets_included: false;
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
  description: "description",
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

export function profilesDir(): string {
  return join(configDir(), "profiles");
}

const SAFE_PROFILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const PROFILE_NAME_PART_PATTERN = /[^a-z0-9._-]+/g;
const PROFILE_NAME_SEPARATOR_PATTERN = /[._-]{2,}/g;

export function assertSafeProfileName(name: string): void {
  if (name.length === 0) {
    throw new ConfigurationError("Profile name cannot be empty.");
  }
  if (name === "." || name === "..") {
    throw new ConfigurationError(`Invalid profile name: ${name}`);
  }
  if (name.includes("/") || name.includes("\\") || name.includes(sep)) {
    throw new ConfigurationError(`Invalid profile name: ${name}`);
  }
  if (!SAFE_PROFILE_NAME_PATTERN.test(name)) {
    throw new ConfigurationError(
      `Invalid profile name: ${name}. Use only letters, digits, dots, underscores, and hyphens.`,
    );
  }

  const resolvedProfileDir = resolve(join(profilesDir(), name));
  const resolvedProfilesRoot = resolve(profilesDir());
  const profilesRootPrefix = resolvedProfilesRoot.endsWith(sep)
    ? resolvedProfilesRoot
    : `${resolvedProfilesRoot}${sep}`;
  if (
    resolvedProfileDir !== resolvedProfilesRoot &&
    !resolvedProfileDir.startsWith(profilesRootPrefix)
  ) {
    throw new ConfigurationError(`Invalid profile name: ${name}`);
  }
}

function profileDir(name: string): string {
  assertSafeProfileName(name);
  return join(profilesDir(), name);
}

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

function readProfileConfigRecord(name: string): Record<ProfileConfigKey, string | undefined> {
  const config = Object.fromEntries(PROFILE_CONFIG_KEYS.map((key) => [key, undefined])) as Record<
    ProfileConfigKey,
    string | undefined
  >;
  for (const key of PROFILE_CONFIG_KEYS) {
    config[key] = kvGet(profileConfigFile(name), key) || undefined;
  }
  return config;
}

function writeProfileUpdate(name: string, update: ProfileUpdate): void {
  for (const profileField of Object.keys(PROFILE_UPDATE_CONFIG_KEYS) as Array<
    keyof ProfileUpdate
  >) {
    const value = update[profileField];
    if (value !== undefined) {
      writeProfileConfig(name, PROFILE_UPDATE_CONFIG_KEYS[profileField], value);
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

export function profileConfigFile(name: string): string {
  return join(profileDir(name), "config");
}

export function profileExists(name: string): boolean {
  return existsSync(profileDir(name));
}

export function ensureProfilesLayout(): void {
  if (!existsSync(profilesDir())) {
    mkdirSync(profileDir(DEFAULT_PROFILE_NAME), { recursive: true });
  }
  if (kvGet(configFile(), "active_profile").length === 0) {
    kvSet(configFile(), "active_profile", DEFAULT_PROFILE_NAME);
  }
}

export function getActiveProfileName(): string {
  ensureProfilesLayout();
  const active = kvGet(configFile(), "active_profile");
  if (active.length > 0 && profileExists(active)) {
    return active;
  }
  return DEFAULT_PROFILE_NAME;
}

export function setActiveProfile(name: string): void {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }
  kvSet(configFile(), "active_profile", name);
}

export function resolveProfileName(override?: string): string {
  ensureProfilesLayout();

  const explicit = override ?? process.env.ALTERTABLE_PROFILE ?? "";

  if (explicit.length > 0) {
    assertSafeProfileName(explicit);
    if (!profileExists(explicit)) {
      throw new ConfigurationError(`Profile not found: ${explicit}`);
    }
    return explicit;
  }

  return getActiveProfileName();
}

export function listProfiles(): ProfileSummary[] {
  ensureProfilesLayout();
  const active = getActiveProfileName();

  if (!existsSync(profilesDir())) {
    return [{ name: DEFAULT_PROFILE_NAME, active: true }];
  }

  const names = readdirSync(profilesDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

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
      description: snapshot.config.description,
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

export function inspectProfile(name: string): ProfileInspect {
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
    description: config.description,
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

export function createProfile(name: string, update: ProfileUpdate = {}): ProfileInspect {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (profileExists(name)) {
    throw new ConfigurationError(`Profile already exists: ${name}`);
  }
  ensureProfileExists(name);
  const createdAt = nowIso();
  writeProfileConfig(name, "created_at", createdAt);
  writeProfileConfig(name, "updated_at", createdAt);
  writeProfileUpdate(name, update);
  return inspectProfile(name);
}

export function updateProfile(name: string, update: ProfileUpdate): ProfileInspect {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }
  writeProfileUpdate(name, update);
  writeProfileConfig(name, "updated_at", nowIso());
  return inspectProfile(name);
}

export function exportProfile(name: string): ProfileExport {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }
  return {
    version: PROFILE_EXPORT_VERSION,
    profile: {
      name,
      config: readProfileConfigRecord(name),
    },
    secrets_included: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseProfileExport(value: unknown): ProfileExport {
  if (!isRecord(value) || !isRecord(value.profile) || !isRecord(value.profile.config)) {
    throw new ConfigurationError("Profile import file is not a valid Altertable profile export.");
  }
  const version = typeof value.version === "number" ? value.version : 0;
  const name = typeof value.profile.name === "string" ? value.profile.name : "";
  const config: Partial<Record<ProfileConfigKey, string | undefined>> = {};
  for (const key of PROFILE_CONFIG_KEYS) {
    const configValue = value.profile.config[key];
    if (configValue !== undefined && typeof configValue !== "string") {
      throw new ConfigurationError(`Profile import config value must be a string: ${key}`);
    }
    config[key] = configValue;
  }
  return {
    version,
    profile: {
      name,
      config: config as Record<ProfileConfigKey, string | undefined>,
    },
    secrets_included: false,
  };
}

export function importProfile(exportedValue: unknown, targetName?: string): ProfileInspect {
  const exported = parseProfileExport(exportedValue);
  if (exported.version !== PROFILE_EXPORT_VERSION) {
    throw new ConfigurationError(`Unsupported profile export version: ${exported.version}`);
  }
  const name = targetName ?? exported.profile.name;
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (profileExists(name)) {
    throw new ConfigurationError(`Profile already exists: ${name}`);
  }
  ensureProfileExists(name);
  for (const key of PROFILE_CONFIG_KEYS) {
    const value = exported.profile.config[key];
    if (value !== undefined) {
      writeProfileConfig(name, key, value);
    }
  }
  if (!readProfileConfig(name, "created_at")) {
    writeProfileConfig(name, "created_at", nowIso());
  }
  writeProfileConfig(name, "updated_at", nowIso());
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

export function profileScopedSecretAccount(account: string, profileName?: string): string {
  if (profileName) {
    assertSafeProfileName(profileName);
    return `profile/${profileName}/${account}`;
  }
  const contextProfile = isCliRuntimeReady() ? getCliContext().profile : undefined;
  const profile = resolveProfileName(contextProfile ?? process.env.ALTERTABLE_PROFILE);
  return `profile/${profile}/${account}`;
}

export function readProfileConfig(profileName: string, key: string): string {
  return kvGet(profileConfigFile(profileName), key);
}

export function writeProfileConfig(profileName: string, key: string, value: string): void {
  assertSafeProfileName(profileName);
  mkdirSync(profileDir(profileName), { recursive: true });
  kvSet(profileConfigFile(profileName), key, value);
}

export function unsetProfileConfig(profileName: string, key: string): void {
  kvUnset(profileConfigFile(profileName), key);
}

export function moveProfileConfigKey(
  sourceProfile: string,
  targetProfile: string,
  key: ProfileConfigKey,
): void {
  const value = readProfileConfig(sourceProfile, key);
  if (!value) {
    return;
  }
  writeProfileConfig(targetProfile, key, value);
  unsetProfileConfig(sourceProfile, key);
}

export function ensureProfileExists(name: string): void {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    mkdirSync(profileDir(name), { recursive: true });
  }
}
