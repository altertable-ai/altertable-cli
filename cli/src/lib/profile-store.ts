import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { configDir, configFile, kvGet, kvSet } from "@/lib/config-files.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { readEnv } from "@/lib/env.ts";

export const DEFAULT_PROFILE_NAME = "default";

// Reserved pseudo-profile: the identity in effect when credentials come from
// environment variables rather than a stored profile. Never a real directory.
export const FROM_ENV_PSEUDOPROFILE_NAME = "_from_env";

const RESERVED_PROFILE_NAMES = new Set<string>([FROM_ENV_PSEUDOPROFILE_NAME]);

export function isFromEnvProfile(name: string): boolean {
  return name === FROM_ENV_PSEUDOPROFILE_NAME;
}

// True when the CLI is configured through environment variables. Any
// profile-configuring var (credentials, endpoints, or environment) isolates the
// active identity to the synthetic `_from_env` profile so no stored profile
// value leaks in. Operational vars (ALTERTABLE_PROFILE, ALTERTABLE_CONFIG_HOME,
// secret backend, OAuth, mock/log) are deliberately excluded.
export function envConfigMode(): boolean {
  return Boolean(
    readEnv("ALTERTABLE_API_KEY") ||
    readEnv("ALTERTABLE_BASIC_AUTH_TOKEN") ||
    (readEnv("ALTERTABLE_LAKEHOUSE_USERNAME") && readEnv("ALTERTABLE_LAKEHOUSE_PASSWORD")) ||
    readEnv("ALTERTABLE_ENV") ||
    readEnv("ALTERTABLE_API_BASE") ||
    readEnv("ALTERTABLE_MANAGEMENT_API_BASE"),
  );
}

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
  // The env pseudo-profile has no directory; never a real stored profile.
  if (isFromEnvProfile(name)) {
    return false;
  }
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
  if (envConfigMode()) {
    return FROM_ENV_PSEUDOPROFILE_NAME;
  }
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

export function resolveWorkingProfile(override?: string): string {
  // Env configuration isolates the active identity; it wins even over an
  // explicit --profile / ALTERTABLE_PROFILE so nothing stored leaks in.
  if (envConfigMode()) {
    return FROM_ENV_PSEUDOPROFILE_NAME;
  }

  ensureProfilesLayout();

  const explicit = override ?? readEnv("ALTERTABLE_PROFILE") ?? "";

  if (explicit.length > 0) {
    assertSafeProfileName(explicit);
    if (!profileExists(explicit)) {
      throw new ConfigurationError(`Profile not found: ${explicit}`);
    }
    return explicit;
  }

  return getActiveProfileName();
}

export function resolveProfileReference(override?: string): string {
  if (envConfigMode()) {
    return FROM_ENV_PSEUDOPROFILE_NAME;
  }

  const explicit = override ?? readEnv("ALTERTABLE_PROFILE") ?? "";
  if (explicit.length > 0) {
    assertSafeProfileName(explicit);
    if (explicit !== DEFAULT_PROFILE_NAME && !profileExists(explicit)) {
      throw new ConfigurationError(`Profile not found: ${explicit}`);
    }
    return explicit;
  }

  const active = kvGet(configFile(), "active_profile");
  if (active.length > 0) {
    assertSafeProfileName(active);
    return active;
  }
  return DEFAULT_PROFILE_NAME;
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
  // The env pseudo-profile is never materialized on disk.
  if (isFromEnvProfile(name)) {
    return;
  }
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    mkdirSync(profileDir(name), { recursive: true });
  }
}

export function configGet(key: string, profileName: string): string {
  // Env config never reads stored values — the whole point of the isolation.
  if (isFromEnvProfile(profileName)) {
    return "";
  }
  return kvGet(profileConfigFile(profileName), key);
}

export function configSet(key: string, value: string, profileName: string): void {
  // The env pseudo-profile has no directory. Profile-mutating commands are
  // refused in env mode; the only writes that reach here are internal caches
  // (e.g. lakehouse credential expiry), which are simply ephemeral — drop them.
  if (isFromEnvProfile(profileName)) {
    return;
  }
  assertSafeProfileName(profileName);
  mkdirSync(profileDir(profileName), { recursive: true });
  kvSet(profileConfigFile(profileName), key, value);
}

export function readProfileConfigRecord(
  name: string,
): Record<ProfileConfigKey, string | undefined> {
  const config = Object.fromEntries(PROFILE_CONFIG_KEYS.map((key) => [key, undefined])) as Record<
    ProfileConfigKey,
    string | undefined
  >;
  if (isFromEnvProfile(name)) {
    return config;
  }
  for (const key of PROFILE_CONFIG_KEYS) {
    config[key] = kvGet(profileConfigFile(name), key) || undefined;
  }
  return config;
}
