import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { configDir, configFile, kvGet, kvSet, kvUnset } from "@/lib/config-files.ts";
import { ConfigurationError } from "@/lib/errors.ts";

export const DEFAULT_PROFILE_NAME = "default";

// Reserved pseudo-profile: the identity in effect when credentials come from
// environment variables rather than a stored profile. Never a real directory.
export const FROM_ENV_PSEUDOPROFILE_NAME = "_from_env";

const RESERVED_PROFILE_NAMES = new Set<string>([FROM_ENV_PSEUDOPROFILE_NAME]);

export const PROFILE_CONFIG_KEYS = [
  "user",
  "api_key_env",
  "api_base",
  "management_api_base",
  "organization_slug",
  "organization_name",
  "principal_type",
  "principal_name",
  "principal_email",
  "principal_slug",
  "created_at",
  "updated_at",
  "last_verified_at",
  "oauth_expiry",
  "lakehouse_credential_expiry",
] as const;

export type ProfileConfigKey = (typeof PROFILE_CONFIG_KEYS)[number];

const PROFILE_SCOPED_KEYS = new Set<string>(PROFILE_CONFIG_KEYS);

export function isProfileScopedConfigKey(key: string): key is ProfileConfigKey {
  return PROFILE_SCOPED_KEYS.has(key);
}

const SAFE_PROFILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function profilesDir(): string {
  return join(configDir(), "profiles");
}

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
  if (RESERVED_PROFILE_NAMES.has(name)) {
    throw new ConfigurationError(`Profile name is reserved: ${name}`);
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

export function profileDir(name: string): string {
  assertSafeProfileName(name);
  return join(profilesDir(), name);
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

export function listProfileNames(): string[] {
  ensureProfilesLayout();
  if (!existsSync(profilesDir())) {
    return [];
  }
  return readdirSync(profilesDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function ensureProfileExists(name: string): void {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    mkdirSync(profileDir(name), { recursive: true });
  }
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

export function readProfileConfigRecord(
  name: string,
): Record<ProfileConfigKey, string | undefined> {
  const config = Object.fromEntries(PROFILE_CONFIG_KEYS.map((key) => [key, undefined])) as Record<
    ProfileConfigKey,
    string | undefined
  >;
  for (const key of PROFILE_CONFIG_KEYS) {
    config[key] = kvGet(profileConfigFile(name), key) || undefined;
  }
  return config;
}
