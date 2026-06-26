import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { configDir, configFile, kvGet, kvSet, kvUnset } from "@/lib/config.ts";
import { getCliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { secretDelete } from "@/lib/secrets.ts";
import { isCliRuntimeReady } from "@/lib/runtime.ts";

export const DEFAULT_PROFILE_NAME = "default";

const PROFILE_SECRET_ACCOUNTS = ["api-key", "lakehouse/password", "lakehouse/basic-token"] as const;

export type ProfileSummary = {
  name: string;
  active: boolean;
  management_env?: string;
  data_plane?: string;
  control_plane?: string;
};

export function profilesDir(): string {
  return join(configDir(), "profiles");
}

const SAFE_PROFILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

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

  return names.map((name) => ({
    name,
    active: name === active,
    management_env: kvGet(profileConfigFile(name), "api_key_env") || undefined,
    data_plane: kvGet(profileConfigFile(name), "api_base") || undefined,
    control_plane: kvGet(profileConfigFile(name), "management_api_base") || undefined,
  }));
}

export function deleteProfile(name: string): void {
  assertSafeProfileName(name);
  ensureProfilesLayout();

  const profiles = listProfiles();
  if (profiles.length <= 1) {
    throw new ConfigurationError("Cannot delete the last profile.");
  }

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

export function ensureProfileExists(name: string): void {
  assertSafeProfileName(name);
  ensureProfilesLayout();
  if (!profileExists(name)) {
    mkdirSync(profileDir(name), { recursive: true });
  }
}
