import { renameSync, rmSync } from "node:fs";
import { ConfigurationError } from "@/lib/errors.ts";
import { PROFILE_CONFIG_KEYS, type ProfileConfigKey } from "@/lib/profile-config-keys.ts";
import { moveProfileSecrets, secretDelete, secretExists } from "@/lib/secrets.ts";
import {
  assertSafeProfileName,
  DEFAULT_PROFILE_NAME,
  ensureProfileExists,
  ensureProfilesLayout,
  getActiveProfileName,
  listProfileNames,
  profileConfigFile,
  profileDir,
  profileExists,
  readProfileConfig,
  readProfileConfigRecord,
  setActiveProfile,
  writeProfileConfig,
} from "@/lib/profile-store.ts";

export {
  assertSafeProfileName,
  DEFAULT_PROFILE_NAME,
  ensureProfileExists,
  ensureProfilesLayout,
  getActiveProfileName,
  moveProfileConfigKey,
  profileConfigFile,
  profileExists,
  profilesDir,
  readProfileConfig,
  resolveProfileName,
  setActiveProfile,
  writeProfileConfig,
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
