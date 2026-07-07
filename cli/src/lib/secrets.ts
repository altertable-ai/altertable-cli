import type { SpawnSyncOptions, SpawnSyncReturns } from "node:child_process";
import { chmodSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { credentialsFile, kvGet, kvSet, kvUnset } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import { logWarn } from "@/lib/log.ts";
import { profileScopedSecretAccount } from "@/lib/profile.ts";

type SecretBackend = "macos" | "file";

let fileBackendWarned = false;

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
  if (!mode) {
    return;
  }

  const modeNumber = Number.parseInt(mode, 8);
  if (modeNumber & 0o077) {
    throw new CliError(
      `Refusing to read ${filePath}: permissions ${mode} are too open (group/other access). Run: chmod 600 ${filePath}`,
    );
  }
}

function warnFileBackendOnce(): void {
  if (!fileBackendWarned) {
    logWarn(
      `No macOS keychain; storing secrets at ${credentialsFile()} (chmod 600). Prefer environment variables in CI.`,
    );
    fileBackendWarned = true;
  }
}

function hasSecurityCommand(): boolean {
  const result = runSpawnSync("security", ["help"], { stdio: "ignore" });
  return result.status === 0 || result.error === undefined;
}

function secretBackend(): SecretBackend {
  const override = process.env.ALTERTABLE_SECRET_BACKEND ?? "";
  if (override === "file") {
    return "file";
  }
  if (override === "keychain") {
    if (process.platform === "darwin" && hasSecurityCommand()) {
      return "macos";
    }
    throw new CliError("ALTERTABLE_SECRET_BACKEND=keychain but the macOS keychain is unavailable.");
  }
  if (process.platform === "darwin" && hasSecurityCommand()) {
    return "macos";
  }
  return "file";
}

function resolveSecretAccount(account: string, profileName?: string): string {
  return profileScopedSecretAccount(account, profileName);
}

export type SecretSetOptions = {
  fromArgv?: boolean;
};

type SpawnSyncFn = (
  command: string,
  args: string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer>;

let spawnSyncOverride: SpawnSyncFn | undefined;

export function setSpawnSyncForTests(fn: SpawnSyncFn | undefined): void {
  spawnSyncOverride = fn;
}

function runSpawnSync(
  command: string,
  args: string[],
  options: SpawnSyncOptions,
): SpawnSyncReturns<Buffer> {
  const spawnFn = spawnSyncOverride ?? spawnSync;
  return spawnFn(command, args, options);
}

function secretSetMacos(storageAccount: string, value: string): void {
  const result = runSpawnSync(
    "security",
    ["add-generic-password", "-U", "-s", "altertable", "-a", storageAccount, "-w", value],
    { stdio: "ignore" },
  );
  if (result.status !== 0) {
    throw new CliError(`Failed to store secret in macOS keychain (${storageAccount}).`);
  }
}

export function secretSet(
  account: string,
  value: string,
  profileName?: string,
  options?: SecretSetOptions,
): void {
  const storageAccount = resolveSecretAccount(account, profileName);
  const backend = secretBackend();
  if (backend === "macos" && !options?.fromArgv) {
    secretSetMacos(storageAccount, value);
    return;
  }

  const filePath = credentialsFile();
  kvSet(filePath, storageAccount, value);
  chmodSync(filePath, 0o600);
  if (backend !== "macos") {
    warnFileBackendOnce();
  }
}

export function secretGet(account: string, profileName?: string): string {
  const storageAccount = resolveSecretAccount(account, profileName);
  const backend = secretBackend();
  if (backend === "macos") {
    const result = runSpawnSync(
      "security",
      ["find-generic-password", "-s", "altertable", "-a", storageAccount, "-w"],
      { encoding: "utf8" },
    );
    const stdout = result.stdout;
    const keychainValue = result.status === 0 ? String(stdout).trim() : "";
    if (keychainValue !== "") {
      return keychainValue;
    }
    requireSafeCredentialsFile();
    return kvGet(credentialsFile(), storageAccount);
  }

  requireSafeCredentialsFile();
  return kvGet(credentialsFile(), storageAccount);
}

export function secretExists(account: string, profileName?: string): boolean {
  const storageAccount = resolveSecretAccount(account, profileName);
  const backend = secretBackend();
  if (backend === "macos") {
    const result = runSpawnSync(
      "security",
      ["find-generic-password", "-s", "altertable", "-a", storageAccount],
      { stdio: "ignore" },
    );
    if (result.status === 0) {
      return true;
    }
    requireSafeCredentialsFile();
    return kvGet(credentialsFile(), storageAccount) !== "";
  }

  requireSafeCredentialsFile();
  return kvGet(credentialsFile(), storageAccount) !== "";
}

export function secretDelete(account: string, profileName?: string): void {
  const storageAccount = resolveSecretAccount(account, profileName);
  const backend = secretBackend();
  if (backend === "macos") {
    runSpawnSync(
      "security",
      ["delete-generic-password", "-s", "altertable", "-a", storageAccount],
      {
        stdio: "ignore",
      },
    );
    kvUnset(credentialsFile(), storageAccount);
    return;
  }

  kvUnset(credentialsFile(), storageAccount);
}

export function moveProfileSecrets(
  sourceProfile: string,
  targetProfile: string,
  accounts: readonly string[],
): void {
  const prepared: Array<{ account: string; targetValue: string }> = [];

  try {
    for (const account of accounts) {
      const sourceValue = secretGet(account, sourceProfile);
      if (sourceValue.length === 0) {
        continue;
      }
      prepared.push({
        account,
        targetValue: secretGet(account, targetProfile),
      });
      secretSet(account, sourceValue, targetProfile);
    }
  } catch (error) {
    for (const entry of prepared.toReversed()) {
      try {
        if (entry.targetValue.length > 0) {
          secretSet(entry.account, entry.targetValue, targetProfile);
        } else {
          secretDelete(entry.account, targetProfile);
        }
      } catch {
        // Best-effort rollback; preserve the original failure for the caller.
      }
    }
    throw error;
  }

  for (const { account } of prepared) {
    secretDelete(account, sourceProfile);
  }
}

export function secretStoreDisplay(): string {
  return secretBackend() === "macos" ? "MacOS keychain" : credentialsFile();
}

// Reset warning flag for tests
export function resetSecretWarningsForTests(): void {
  fileBackendWarned = false;
}
