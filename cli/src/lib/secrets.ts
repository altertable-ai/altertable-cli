import type { SpawnSyncOptions } from "node:child_process";
import { spawnSync } from "node:child_process";
import { chmodSync, statSync } from "node:fs";
import { credentialsFile, kvGet, kvSet, kvUnset } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import { logWarn } from "@/lib/log.ts";
import { readEnv } from "@/lib/env.ts";
import {
  assertSafeProfileName,
  ensureProfileId,
  getProfileId,
  isFromEnvProfile,
} from "@/lib/profile-store.ts";

type SecretBackend = "macos" | "file";

// `security` returns errSecItemNotFound (-25300) modulo 256 as its process status.
const KEYCHAIN_ITEM_NOT_FOUND_STATUS = 44;

type SecretProcessResult = {
  status: number | null;
  stdout: string | Buffer;
  error?: Error;
};

function keychainLookupFailed(result: SecretProcessResult): boolean {
  return result.status !== 0 && result.status !== KEYCHAIN_ITEM_NOT_FOUND_STATUS;
}

type SecretProcess = {
  platform: NodeJS.Platform;
  spawnSync(command: string, args: string[], options: SpawnSyncOptions): SecretProcessResult;
};

export type SecretSetOptions = {
  fromArgv?: boolean;
};

export type SecretStore = {
  secretSet(account: string, value: string, profileName: string, options?: SecretSetOptions): void;
  secretGet(key: string, profileName: string): string;
  secretExists(key: string, profileName: string): boolean;
  secretDelete(key: string, profileName: string): void;
  migrateProfileSecrets(profileName: string, keys: readonly string[]): void;
  secretStoreDisplay(): string;
};

const SYSTEM_SECRET_PROCESS: SecretProcess = {
  platform: process.platform,
  spawnSync(command, args, options) {
    return spawnSync(command, args, options) as unknown as SecretProcessResult;
  },
};

function fileMode(filePath: string): string {
  try {
    const stat = statSync(filePath);
    return (stat.mode & 0o777).toString(8);
  } catch {
    return "";
  }
}

function requireSafeCredentialsFile(): void {
  const filePath = credentialsFile();
  try {
    statSync(filePath);
  } catch {
    return;
  }

  const mode = fileMode(filePath);
  if (!mode) return;

  const modeNumber = Number.parseInt(mode, 8);
  if (modeNumber & 0o077) {
    throw new CliError(
      `Refusing to read ${filePath}: permissions ${mode} are too open (group/other access). Run: chmod 600 ${filePath}`,
    );
  }
}

function legacySecretKey(key: string, profileName: string): string {
  assertSafeProfileName(profileName);
  return `profile/${profileName}/${key}`;
}

function stableSecretKey(key: string, profileId: string): string {
  return `profile/${profileId}/${key}`;
}

export function createSecretStore(
  secretProcess: SecretProcess = SYSTEM_SECRET_PROCESS,
): SecretStore {
  let fileBackendWarned = false;

  function warnFileBackendOnce(): void {
    if (fileBackendWarned) return;
    logWarn(
      `No macOS keychain; storing secrets at ${credentialsFile()} (chmod 600). Prefer environment variables in CI.`,
    );
    fileBackendWarned = true;
  }

  function hasSecurityCommand(): boolean {
    const result = secretProcess.spawnSync("security", ["help"], { stdio: "ignore" });
    return result.status === 0 || result.error === undefined;
  }

  function secretBackend(): SecretBackend {
    const override = readEnv("ALTERTABLE_SECRET_BACKEND") ?? "";
    if (override === "file") return "file";
    if (override === "keychain") {
      if (secretProcess.platform === "darwin" && hasSecurityCommand()) return "macos";
      throw new CliError(
        "ALTERTABLE_SECRET_BACKEND=keychain but the macOS keychain is unavailable.",
      );
    }
    if (secretProcess.platform === "darwin" && hasSecurityCommand()) return "macos";
    return "file";
  }

  function secretSetMacos(storageAccount: string, value: string): void {
    const result = secretProcess.spawnSync(
      "security",
      ["add-generic-password", "-U", "-s", "altertable", "-a", storageAccount, "-w", value],
      { stdio: "ignore" },
    );
    if (result.status !== 0) {
      throw new CliError(`Failed to store secret in macOS keychain (${storageAccount}).`);
    }
  }

  function readStoredSecret(storageAccount: string): string {
    if (secretBackend() === "macos") {
      const result = secretProcess.spawnSync(
        "security",
        ["find-generic-password", "-s", "altertable", "-a", storageAccount, "-w"],
        { encoding: "utf8" },
      );
      if (keychainLookupFailed(result)) {
        throw new CliError(`Failed to read secret from macOS keychain (${storageAccount}).`);
      }
      const keychainValue = result.status === 0 ? String(result.stdout).trim() : "";
      if (keychainValue !== "") return keychainValue;
    }
    requireSafeCredentialsFile();
    return kvGet(credentialsFile(), storageAccount);
  }

  function storedSecretExists(storageAccount: string): boolean {
    if (secretBackend() === "macos") {
      const result = secretProcess.spawnSync(
        "security",
        ["find-generic-password", "-s", "altertable", "-a", storageAccount],
        { stdio: "ignore" },
      );
      if (result.status === 0) return true;
      if (keychainLookupFailed(result)) {
        throw new CliError(`Failed to inspect secret in macOS keychain (${storageAccount}).`);
      }
    }
    requireSafeCredentialsFile();
    return kvGet(credentialsFile(), storageAccount) !== "";
  }

  function deleteStoredSecret(storageAccount: string): void {
    if (secretBackend() === "macos") {
      const result = secretProcess.spawnSync(
        "security",
        ["delete-generic-password", "-s", "altertable", "-a", storageAccount],
        { stdio: "ignore" },
      );
      if (result.status !== 0 && result.status !== KEYCHAIN_ITEM_NOT_FOUND_STATUS) {
        throw new CliError(`Failed to delete secret from macOS keychain (${storageAccount}).`);
      }
    }
    kvUnset(credentialsFile(), storageAccount);
  }

  function secretSet(
    account: string,
    value: string,
    profileName: string,
    options?: SecretSetOptions,
  ): void {
    // Env config isolates to `_from_env`, which has no store. Profile-mutating
    // commands are refused in env mode; in-process caches are deliberately dropped.
    if (isFromEnvProfile(profileName)) return;

    const storageAccount = stableSecretKey(account, ensureProfileId(profileName));
    const backend = secretBackend();
    if (backend === "macos" && !options?.fromArgv) {
      secretSetMacos(storageAccount, value);
      return;
    }

    const filePath = credentialsFile();
    kvSet(filePath, storageAccount, value);
    chmodSync(filePath, 0o600);
    if (backend !== "macos") warnFileBackendOnce();
  }

  function secretGet(key: string, profileName: string): string {
    if (isFromEnvProfile(profileName)) return "";

    const profileId = getProfileId(profileName);
    if (profileId) {
      const value = readStoredSecret(stableSecretKey(key, profileId));
      if (value !== "") return value;
    }
    return readStoredSecret(legacySecretKey(key, profileName));
  }

  function secretExists(key: string, profileName: string): boolean {
    if (isFromEnvProfile(profileName)) return false;

    const profileId = getProfileId(profileName);
    if (profileId && storedSecretExists(stableSecretKey(key, profileId))) {
      return true;
    }
    return storedSecretExists(legacySecretKey(key, profileName));
  }

  function secretDelete(key: string, profileName: string): void {
    if (isFromEnvProfile(profileName)) return;

    const profileId = getProfileId(profileName);
    if (profileId) {
      deleteStoredSecret(stableSecretKey(key, profileId));
    }
    deleteStoredSecret(legacySecretKey(key, profileName));
  }

  function migrateProfileSecrets(profileName: string, keys: readonly string[]): void {
    const profileId = ensureProfileId(profileName);
    const legacySecrets = keys.flatMap((key) => {
      const value = readStoredSecret(legacySecretKey(key, profileName));
      return value === "" ? [] : [{ key, value }];
    });

    for (const { key, value } of legacySecrets) {
      const storageAccount = stableSecretKey(key, profileId);
      if (!storedSecretExists(storageAccount)) {
        if (secretBackend() === "macos") {
          secretSetMacos(storageAccount, value);
        } else {
          kvSet(credentialsFile(), storageAccount, value);
          chmodSync(credentialsFile(), 0o600);
        }
      }
    }
    for (const { key } of legacySecrets) {
      deleteStoredSecret(legacySecretKey(key, profileName));
    }
  }

  function secretStoreDisplay(): string {
    return secretBackend() === "macos" ? "MacOS keychain" : credentialsFile();
  }

  return {
    secretSet,
    secretGet,
    secretExists,
    secretDelete,
    migrateProfileSecrets,
    secretStoreDisplay,
  };
}

const systemSecretStore = createSecretStore();

export function secretSet(
  account: string,
  value: string,
  profileName: string,
  options?: SecretSetOptions,
): void {
  systemSecretStore.secretSet(account, value, profileName, options);
}

export function secretGet(key: string, profileName: string): string {
  return systemSecretStore.secretGet(key, profileName);
}

export function secretExists(key: string, profileName: string): boolean {
  return systemSecretStore.secretExists(key, profileName);
}

export function secretDelete(key: string, profileName: string): void {
  systemSecretStore.secretDelete(key, profileName);
}

export function migrateProfileSecrets(profileName: string, keys: readonly string[]): void {
  systemSecretStore.migrateProfileSecrets(profileName, keys);
}

export function secretStoreDisplay(): string {
  return systemSecretStore.secretStoreDisplay();
}
