import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { CliContext } from "@/context.ts";
import { isJsonOutput } from "@/context.ts";
import { USER_AGENT, VERSION } from "@/version.ts";
import { configDir, configGetGlobal } from "@/lib/config.ts";
import { CliError, HttpError, NetworkError } from "@/lib/errors.ts";
import { hasObjectKey } from "@/lib/object.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { getOutputSink } from "@/lib/runtime.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";
import { span } from "@/ui/document.ts";
import { copyProcessEnv, readEnv, readEnvFrom } from "@/lib/env.ts";
import { resolveProcessExecutablePath } from "@/lib/executable-path.ts";
import {
  UpdaterInstallationKind,
  UpdaterCheckIntervals,
  UpdaterInstallMethod,
  UpdaterConfig,
  type InstallationKind,
  type InstallManager,
  type ReleasePlatform,
  type ResolvedUpdateInstallMethod,
  type UpdateCheckInterval,
  type UpdateInstallMethod,
  type UpdateSource,
} from "@/lib/updater-config.ts";

export type ReleaseInfo = {
  version: string;
  source: UpdateSource;
  releaseUrl: string;
};

export type UpdateCheckResult = {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  source: UpdateSource;
  release_url: string;
  checked_at: string;
  install_command: string;
};

export type UpdateState = {
  last_checked_at?: string;
  latest_version?: string;
  source?: UpdateSource;
  release_url?: string;
  last_error?: string;
};

export type InstallPlan = {
  manager: InstallManager;
  command: string;
  args: string[];
  display: string;
};

export type CurrentInstallation = {
  kind: InstallationKind;
  executablePath: string;
  reason?: string;
};

export type GitHubBinaryRelease = {
  version: string;
  releaseUrl: string;
  assetName: string;
  assetDownloadUrl: string;
  checksumsDownloadUrl: string;
};

export type UpdateInstallResult = {
  installed_version: string;
  verified_version: string;
  method: ResolvedUpdateInstallMethod;
  command?: string;
  manager?: InstallManager;
  target_path?: string;
};

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

type FetchLatestOptions = {
  source?: UpdateSource;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type FetchGitHubBinaryReleaseOptions = {
  version?: string;
  platform?: ReleasePlatform;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type SpawnSyncImpl = typeof spawnSync;

type RunInstallPlanOptions = {
  stdio?: "inherit" | "pipe";
  spawnImpl?: SpawnSyncImpl;
  verifyCommand?: string;
  verifyGlobalInstall?: boolean;
  verify?: boolean;
  expectedVersion?: string;
};

type InstallCliUpdateOptions = {
  method?: UpdateInstallMethod;
  targetPath?: string;
  platform?: ReleasePlatform;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  spawnImpl?: SpawnSyncImpl;
  stdio?: "inherit" | "pipe";
  verify?: boolean;
  installation?: CurrentInstallation;
};

type AutomaticNoticeOptions = FetchLatestOptions & {
  context: CliContext;
  commandName?: string;
  sink?: OutputSink;
  now?: Date;
  stderrIsTTY?: boolean;
};

const AUTO_SKIP_COMMANDS: ReadonlySet<string> = new Set(UpdaterConfig.automaticCheckSkipCommands);

function parseVersion(version: string): ParsedVersion | undefined {
  const match = version
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) {
    return undefined;
  }
  return {
    major: Number.parseInt(match[1] ?? "0", 10),
    minor: Number.parseInt(match[2] ?? "0", 10),
    patch: Number.parseInt(match[3] ?? "0", 10),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left) ? Number.parseInt(left, 10) : undefined;
  const rightNumber = /^\d+$/.test(right) ? Number.parseInt(right, 10) : undefined;

  if (leftNumber !== undefined && rightNumber !== undefined) {
    return Math.sign(leftNumber - rightNumber);
  }
  if (leftNumber !== undefined) {
    return -1;
  }
  if (rightNumber !== undefined) {
    return 1;
  }
  return left.localeCompare(right);
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function isValidVersion(version: string): boolean {
  return parseVersion(version) !== undefined;
}

export function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  if (!left || !right) {
    return normalizeVersion(leftVersion).localeCompare(normalizeVersion(rightVersion));
  }

  for (const key of ["major", "minor", "patch"] as const) {
    const delta = left[key] - right[key];
    if (delta !== 0) {
      return Math.sign(delta);
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length > 0) {
    return 1;
  }
  if (left.prerelease.length > 0 && right.prerelease.length === 0) {
    return -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined && rightIdentifier === undefined) {
      return 0;
    }
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }
    const compared = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (compared !== 0) {
      return Math.sign(compared);
    }
  }
  return 0;
}

function updaterStateFile(): string {
  return join(configDir(), UpdaterConfig.stateFileName);
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = tempSiblingPath(filePath, "update");
  try {
    writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmpPath, filePath);
  } finally {
    rmSync(tmpPath, { force: true });
  }
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // best effort
  }
}

export function readUpdateState(): UpdateState {
  try {
    const parsed = JSON.parse(readFileSync(updaterStateFile(), "utf8")) as UpdateState;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
    // missing or corrupt state should not block the CLI
  }
  return {};
}

export function writeUpdateState(state: UpdateState): void {
  writeJsonFileAtomic(updaterStateFile(), state);
}

function tryWriteUpdateState(state: UpdateState): void {
  try {
    writeUpdateState(state);
  } catch {
    // Automatic update notices are best-effort and must not fail the user's command.
  }
}

export function parseUpdateCheckInterval(value: string): UpdateCheckInterval | undefined {
  if (isAllowedValue(UpdaterCheckIntervals, value)) {
    return value;
  }
  return undefined;
}

export function getUpdateCheckInterval(): UpdateCheckInterval {
  const fromConfig = parseUpdateCheckInterval(
    configGetGlobal(UpdaterConfig.configKeys.checkInterval),
  );
  return fromConfig ?? UpdaterConfig.defaults.checkInterval;
}

export function resolveUpdateSource(source?: UpdateSource): UpdateSource {
  return source ?? readEnv("ALTERTABLE_UPDATE_SOURCE") ?? UpdaterConfig.defaults.source;
}

export function resolveUpdateInstallMethod(method?: UpdateInstallMethod): UpdateInstallMethod {
  return (
    method ?? readEnv("ALTERTABLE_UPDATE_INSTALL_METHOD") ?? UpdaterConfig.defaults.installMethod
  );
}

function isAllowedValue<TValue extends string>(
  values: readonly TValue[],
  value: string | undefined,
): value is TValue {
  return value !== undefined && values.includes(value as TValue);
}

function repoSegments(repo: string): [string, string] {
  const segments = repo.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2) {
    throw new CliError(`Invalid GitHub repository slug: ${repo}.`);
  }
  return [segments[0] ?? "", segments[1] ?? ""];
}

function npmRegistryUrl(): string {
  const registry =
    readEnv("ALTERTABLE_UPDATE_REGISTRY_URL") ?? UpdaterConfig.sources.npm.registryUrl;
  const url = new URL(registry);
  appendEncodedUrlPath(url, UpdaterConfig.packageName, "latest");
  return url.toString();
}

function githubLatestReleaseUrl(): string {
  const repo = readEnv("ALTERTABLE_UPDATE_GITHUB_REPO") ?? UpdaterConfig.githubRepo;
  const url = new URL(UpdaterConfig.sources.github.apiBaseUrl);
  appendEncodedUrlPath(url, ...repoSegments(repo), "releases", "latest");
  return url.toString();
}

function githubReleaseMetadataUrl(version?: string): string {
  if (!version) {
    return githubLatestReleaseUrl();
  }
  const repo = readEnv("ALTERTABLE_UPDATE_GITHUB_REPO") ?? UpdaterConfig.githubRepo;
  const url = new URL(UpdaterConfig.sources.github.apiBaseUrl);
  appendEncodedUrlPath(
    url,
    ...repoSegments(repo),
    "releases",
    "tags",
    `v${normalizeVersion(version)}`,
  );
  return url.toString();
}

function githubReleasesFallbackUrl(): string {
  const url = new URL(UpdaterConfig.sources.github.webBaseUrl);
  appendEncodedUrlPath(url, ...repoSegments(UpdaterConfig.githubRepo), "releases");
  return url.toString();
}

function githubReleaseTagUrl(version: string): string {
  const url = new URL(UpdaterConfig.sources.github.webBaseUrl);
  appendEncodedUrlPath(
    url,
    ...repoSegments(UpdaterConfig.githubRepo),
    "releases",
    "tag",
    `v${normalizeVersion(version)}`,
  );
  return url.toString();
}

export function packageReleaseUrl(version: string): string {
  const url = new URL(UpdaterConfig.sources.npm.packageBaseUrl);
  appendEncodedUrlPath(url, UpdaterConfig.packageName, "v", normalizeVersion(version));
  return url.toString();
}

export function releaseUrlForSource(source: UpdateSource, version: string): string {
  if (source === "github") {
    return githubReleaseTagUrl(version);
  }
  return packageReleaseUrl(version);
}

function appendEncodedUrlPath(url: URL, ...rawSegments: string[]): void {
  const baseSegments = url.pathname.split("/").filter((segment) => segment.length > 0);
  url.pathname = [...baseSegments, ...rawSegments.map(encodeURIComponent)]
    .filter((segment) => segment.length > 0)
    .join("/")
    .replace(/^/, "/");
}

async function fetchResponse(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new NetworkError("Unable to check for CLI updates.", { cause: error });
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // best effort
    }
    throw new HttpError({
      status: response.status,
      body,
      method: "GET",
      url,
    });
  }

  return response;
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchResponse(url, timeoutMs, fetchImpl);
  try {
    return await response.json();
  } catch (error) {
    throw new CliError("Update metadata was not valid JSON.", { cause: error });
  }
}

function updateMetadataNotFoundError(
  source: UpdateSource,
  error: HttpError,
  version?: string,
): CliError {
  if (source === "github") {
    const label = version ? `v${normalizeVersion(version)}` : "latest";
    return new CliError(`No GitHub release metadata found for ${label}.`, {
      cause: error,
      details: [
        `Checked: ${error.url}`,
        `Open releases: ${githubReleasesFallbackUrl()}`,
        "If you are running from a source checkout, update it with git pull.",
      ].join("\n"),
    });
  }

  return new CliError(`No published npm release found for ${UpdaterConfig.packageName}.`, {
    cause: error,
    details: [
      `Checked: ${error.url}`,
      "Try GitHub releases instead: altertable update --source github",
      "If you are running from a source checkout, update it with git pull.",
    ].join("\n"),
  });
}

async function fetchUpdateJson(
  source: UpdateSource,
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  version?: string,
): Promise<unknown> {
  try {
    return await fetchJson(url, timeoutMs, fetchImpl);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw updateMetadataNotFoundError(source, error, version);
    }
    throw error;
  }
}

async function fetchText(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchResponse(url, timeoutMs, fetchImpl);
  return await response.text();
}

async function fetchBytes(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Uint8Array> {
  const response = await fetchResponse(url, timeoutMs, fetchImpl);
  return new Uint8Array(await response.arrayBuffer());
}

function readStringProperty(data: unknown, key: string): string {
  if (typeof data !== "object" || data === null || !(key in data)) {
    return "";
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readArrayProperty(data: unknown, key: string): unknown[] {
  if (typeof data !== "object" || data === null || !(key in data)) {
    return [];
  }
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

export function detectReleasePlatform(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ReleasePlatform {
  const releasePlatform = `${platform}-${arch}`;
  if (hasObjectKey(UpdaterConfig.releasePlatforms, releasePlatform)) {
    return releasePlatform;
  }
  throw new CliError(`Unsupported self-update platform: ${platform}-${arch}.`, {
    details: `Download a release manually from ${githubReleasesFallbackUrl()}.`,
  });
}

export function releaseAssetName(platform: ReleasePlatform): string {
  return UpdaterConfig.releasePlatforms[platform].asset;
}

function readGitHubAsset(data: unknown): { name: string; downloadUrl: string } | undefined {
  const name = readStringProperty(data, "name");
  const downloadUrl = readStringProperty(data, "browser_download_url");
  if (!name || !downloadUrl) {
    return undefined;
  }
  return { name, downloadUrl };
}

function findGitHubAsset(data: unknown, assetName: string): string {
  for (const rawAsset of readArrayProperty(data, "assets")) {
    const asset = readGitHubAsset(rawAsset);
    if (asset?.name === assetName) {
      return asset.downloadUrl;
    }
  }
  throw new CliError(`GitHub release did not include ${assetName}.`);
}

export async function fetchGitHubBinaryRelease(
  options: FetchGitHubBinaryReleaseOptions = {},
): Promise<GitHubBinaryRelease> {
  const platform = options.platform ?? detectReleasePlatform();
  const assetName = releaseAssetName(platform);
  const timeoutMs = options.timeoutMs ?? UpdaterConfig.timeoutsMs.manual;
  const fetchImpl = options.fetchImpl ?? fetch;
  const data = await fetchUpdateJson(
    "github",
    githubReleaseMetadataUrl(options.version),
    timeoutMs,
    fetchImpl,
    options.version,
  );
  const version = normalizeVersion(readStringProperty(data, "tag_name"));
  if (!version) {
    throw new CliError("GitHub release metadata did not include a tag_name.");
  }

  return {
    version,
    releaseUrl: readStringProperty(data, "html_url") || githubReleaseTagUrl(version),
    assetName,
    assetDownloadUrl: findGitHubAsset(data, assetName),
    checksumsDownloadUrl: findGitHubAsset(data, UpdaterConfig.checksumsAssetName),
  };
}

export function parseChecksums(text: string): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) {
      continue;
    }
    const hash = match[1]?.toLowerCase();
    const filename = match[2]?.trim();
    if (hash && filename) {
      checksums.set(filename, hash);
    }
  }
  return checksums;
}

export function verifySha256(filePath: string, expectedHash: string): boolean {
  const actualHash = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  return actualHash === expectedHash.toLowerCase();
}

export async function fetchLatestRelease(options: FetchLatestOptions = {}): Promise<ReleaseInfo> {
  const source = resolveUpdateSource(options.source);
  const timeoutMs = options.timeoutMs ?? UpdaterConfig.timeoutsMs.manual;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (source === "github") {
    const data = await fetchUpdateJson(source, githubLatestReleaseUrl(), timeoutMs, fetchImpl);
    const version = normalizeVersion(readStringProperty(data, "tag_name"));
    if (!version) {
      throw new CliError("GitHub release metadata did not include a tag_name.");
    }
    return {
      version,
      source,
      releaseUrl: readStringProperty(data, "html_url") || githubReleasesFallbackUrl(),
    };
  }

  const data = await fetchUpdateJson(source, npmRegistryUrl(), timeoutMs, fetchImpl);
  const version = normalizeVersion(readStringProperty(data, "version"));
  if (!version) {
    throw new CliError("npm package metadata did not include a version.");
  }
  return {
    version,
    source,
    releaseUrl: packageReleaseUrl(version),
  };
}

export function detectInstallManager(env: NodeJS.ProcessEnv = copyProcessEnv()): InstallManager {
  const override = readEnvFrom(env, "ALTERTABLE_UPDATE_INSTALLER");
  if (override) {
    return override;
  }

  const userAgent = readEnvFrom(env, "npm_config_user_agent") ?? "";
  if (userAgent.startsWith("bun/")) {
    return "bun";
  }
  if (userAgent.startsWith("pnpm/")) {
    return "pnpm";
  }
  if (userAgent.startsWith("yarn/")) {
    return "yarn";
  }
  if (userAgent.startsWith("npm/")) {
    return "npm";
  }
  if (readEnvFrom(env, "BUN_INSTALL")) {
    return "bun";
  }
  return UpdaterConfig.defaults.installManager;
}

export function createInstallPlan(
  version: string,
  manager: InstallManager = detectInstallManager(),
): InstallPlan {
  const packageSpecifier = `${UpdaterConfig.packageName}@${normalizeVersion(version)}`;
  const plan = UpdaterConfig.installCommands[manager];
  const args = [...plan.argsBeforePackage, packageSpecifier];
  return {
    manager,
    command: plan.command,
    args,
    display: [plan.command, ...args].join(" "),
  };
}

function pathEndsWith(filePath: string, suffix: string): boolean {
  return filePath.replace(/\\/g, "/").endsWith(suffix);
}

function anyEndsWith(value: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => value.endsWith(suffix));
}

function anyEquals(value: string, values: readonly string[]): boolean {
  return values.some((candidate) => candidate === value);
}

function pathEndsWithAny(filePath: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => pathEndsWith(filePath, suffix));
}

export function detectCurrentInstallation(
  options: {
    execPath?: string;
    argv0?: string;
    argv?: readonly string[];
    cwd?: string;
    path?: string;
  } = {},
): CurrentInstallation {
  const execPath = resolveProcessExecutablePath({
    ...options,
    path: options.path ?? readEnv("PATH"),
  });
  const argv = options.argv ?? process.argv;
  const scriptPath = argv[1] ?? "";
  const execName = basename(execPath);
  const scriptName = basename(scriptPath);
  const detection = UpdaterConfig.installationDetection;

  if (
    pathEndsWithAny(scriptPath, detection.sourceScriptSuffixes) ||
    anyEndsWith(scriptName, detection.sourceScriptExtensions)
  ) {
    return {
      kind: UpdaterInstallationKind.source,
      executablePath: scriptPath || execPath,
      reason: "running from TypeScript source",
    };
  }

  if (
    pathEndsWithAny(scriptPath, detection.packageScriptSuffixes) ||
    anyEquals(scriptName, detection.packageScriptNames) ||
    anyEndsWith(scriptName, detection.packageScriptExtensions)
  ) {
    return {
      kind: UpdaterInstallationKind.packageManager,
      executablePath: scriptPath || execPath,
      reason: "running a JavaScript package entrypoint",
    };
  }

  if (
    execName === UpdaterConfig.executableName ||
    execName.startsWith(`${UpdaterConfig.binaryAssetPrefix}-`)
  ) {
    return {
      kind: UpdaterInstallationKind.nativeBinary,
      executablePath: execPath,
      reason: "running a native release binary",
    };
  }

  if (
    anyEquals(execName, detection.bunExecutableNames) ||
    execName.startsWith(detection.bunExecutablePrefix)
  ) {
    return {
      kind: UpdaterInstallationKind.source,
      executablePath: scriptPath || execPath,
      reason: "running under Bun",
    };
  }

  return {
    kind: UpdaterInstallationKind.unknown,
    executablePath: execPath,
    reason: "unable to identify installation origin",
  };
}

function resolveInstallMethodForInstallation(
  requestedMethod: UpdateInstallMethod,
  installation: CurrentInstallation,
): ResolvedUpdateInstallMethod {
  if (requestedMethod !== UpdaterInstallMethod.auto) {
    return requestedMethod;
  }
  if (installation.kind === UpdaterInstallationKind.nativeBinary) {
    return UpdaterInstallMethod.githubBinary;
  }
  return UpdaterInstallMethod.packageManager;
}

function spawnOutputText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return "";
}

export function verifyInstalledCliVersion(
  expectedVersion: string,
  command = "altertable",
  spawnImpl: SpawnSyncImpl = spawnSync,
  description = "Installed altertable",
): string {
  const result = spawnImpl(command, ["--version"], { encoding: "utf8" });
  if (result.error) {
    throw new CliError(`Unable to verify ${description.toLowerCase()} version.`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new CliError(`${description} version check failed with exit code ${result.status ?? 1}.`);
  }
  const installedVersion = normalizeVersion(spawnOutputText(result.stdout).trim());
  if (compareVersions(installedVersion, expectedVersion) !== 0) {
    throw new CliError(
      `${description} version is ${installedVersion || "unknown"}, expected ${normalizeVersion(
        expectedVersion,
      )}.`,
    );
  }
  return installedVersion;
}

function tempSiblingPath(targetPath: string, suffix: string): string {
  return join(dirname(targetPath), `.altertable-${suffix}-${randomBytes(8).toString("hex")}`);
}

function replaceFileAtomically(targetPath: string, replacementPath: string): void {
  const backupPath = tempSiblingPath(targetPath, "backup");
  let backupCreated = false;
  try {
    renameSync(targetPath, backupPath);
    backupCreated = true;
    renameSync(replacementPath, targetPath);
    rmSync(backupPath, { force: true });
  } catch (error) {
    if (backupCreated && !existsSync(targetPath)) {
      try {
        renameSync(backupPath, targetPath);
      } catch {
        // Preserve the original failure; the backup path is included below.
      }
    }
    rmSync(replacementPath, { force: true });
    throw new CliError("Unable to replace the altertable binary.", {
      cause: error,
      details: `Backup path: ${backupPath}`,
    });
  }
}

function resolveGitHubBinaryTarget(options: InstallCliUpdateOptions): string {
  const installation = options.installation ?? detectCurrentInstallation();
  const targetPath = options.targetPath ?? installation.executablePath;
  if (!options.targetPath && installation.kind !== UpdaterInstallationKind.nativeBinary) {
    throw new CliError("Self-update is only supported for native release binaries.", {
      details:
        "Install the published package with your package manager, or use a native release binary.",
    });
  }
  return targetPath;
}

async function writeVerifiedGitHubBinaryDownload(options: {
  release: GitHubBinaryRelease;
  targetPath: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const tempPath = tempSiblingPath(options.targetPath, "download");
  try {
    const bytes = await fetchBytes(
      options.release.assetDownloadUrl,
      options.timeoutMs,
      options.fetchImpl,
    );
    writeFileSync(tempPath, bytes, { mode: 0o755 });
    const checksumsText = await fetchText(
      options.release.checksumsDownloadUrl,
      options.timeoutMs,
      options.fetchImpl,
    );
    const expectedHash = parseChecksums(checksumsText).get(options.release.assetName);
    if (!expectedHash) {
      throw new CliError(`Checksum file did not include ${options.release.assetName}.`);
    }
    if (!verifySha256(tempPath, expectedHash)) {
      throw new CliError(`Checksum verification failed for ${options.release.assetName}.`);
    }
    chmodSync(tempPath, 0o755);
    return tempPath;
  } catch (error) {
    rmSync(tempPath, { force: true });
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError("Unable to install GitHub release binary.", { cause: error });
  }
}

export async function installGitHubBinaryRelease(
  version: string,
  options: InstallCliUpdateOptions = {},
): Promise<UpdateInstallResult> {
  const targetPath = resolveGitHubBinaryTarget(options);
  const timeoutMs = options.timeoutMs ?? UpdaterConfig.timeoutsMs.manual;
  const fetchImpl = options.fetchImpl ?? fetch;
  const release = await fetchGitHubBinaryRelease({
    version,
    platform: options.platform,
    timeoutMs,
    fetchImpl,
  });
  const tempPath = await writeVerifiedGitHubBinaryDownload({
    release,
    targetPath,
    timeoutMs,
    fetchImpl,
  });
  try {
    const verifiedVersion =
      options.verify === false
        ? release.version
        : verifyInstalledCliVersion(
            release.version,
            tempPath,
            options.spawnImpl,
            "Downloaded altertable",
          );
    replaceFileAtomically(targetPath, tempPath);

    return {
      installed_version: release.version,
      verified_version: verifiedVersion,
      method: UpdaterInstallMethod.githubBinary,
      target_path: targetPath,
    };
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function runInstallPlan(plan: InstallPlan, options: RunInstallPlanOptions = {}): string {
  const stdio = options.stdio ?? "inherit";
  const spawnImpl = options.spawnImpl ?? spawnSync;
  const result = spawnImpl(plan.command, plan.args, { stdio });
  if (result.error) {
    throw new CliError(`Unable to run ${plan.command}.`, { cause: result.error });
  }
  if (result.signal) {
    throw new CliError(`Update command was interrupted by ${result.signal}.`);
  }
  if (result.status !== 0) {
    const stderr = spawnOutputText(result.stderr).trim();
    throw new CliError(`Update command failed with exit code ${result.status ?? 1}.`, {
      details: stderr || undefined,
    });
  }

  if (options.verify === false) {
    return normalizeVersion(options.expectedVersion ?? "");
  }
  const verifyCommand =
    options.verifyCommand ??
    (options.verifyGlobalInstall
      ? resolveGlobalInstalledCliPath(plan.manager, spawnImpl)
      : "altertable");
  return verifyInstalledCliVersion(
    options.expectedVersion ?? plan.args[plan.args.length - 1]?.split("@").pop() ?? "",
    verifyCommand,
    spawnImpl,
  );
}

function resolveGlobalInstalledCliPath(manager: InstallManager, spawnImpl: SpawnSyncImpl): string {
  const config = UpdaterConfig.installCommands[manager];
  const result = spawnImpl(config.command, [...config.globalBinArgs], { encoding: "utf8" });
  if (result.error) {
    throw new CliError(`Unable to locate the ${manager} global binary directory.`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new CliError(
      `${manager} global binary directory lookup failed with exit code ${result.status ?? 1}.`,
    );
  }
  const outputPath = spawnOutputText(result.stdout).trim();
  if (!outputPath) {
    throw new CliError(`${manager} did not report its global binary directory.`);
  }
  const binDirectory =
    "globalBinIsPrefix" in config && config.globalBinIsPrefix && process.platform !== "win32"
      ? join(outputPath, "bin")
      : outputPath;
  const executableName =
    process.platform === "win32"
      ? `${UpdaterConfig.executableName}.cmd`
      : UpdaterConfig.executableName;
  return join(binDirectory, executableName);
}

function installPackageManagerRelease(
  version: string,
  options: InstallCliUpdateOptions = {},
): UpdateInstallResult {
  const plan = createInstallPlan(version);
  const verifiedVersion = runInstallPlan(plan, {
    stdio: options.stdio,
    spawnImpl: options.spawnImpl,
    expectedVersion: version,
    verifyGlobalInstall: options.installation?.kind === UpdaterInstallationKind.source,
    verify: options.verify,
  });
  return {
    installed_version: normalizeVersion(version),
    verified_version: verifiedVersion || normalizeVersion(version),
    method: UpdaterInstallMethod.packageManager,
    manager: plan.manager,
    command: plan.display,
  };
}

export async function installCliUpdate(
  version: string,
  options: InstallCliUpdateOptions = {},
): Promise<UpdateInstallResult> {
  const installation = options.installation ?? detectCurrentInstallation();
  const requestedMethod = resolveUpdateInstallMethod(options.method);
  const method = resolveInstallMethodForInstallation(requestedMethod, installation);

  if (method === UpdaterInstallMethod.githubBinary) {
    return await installGitHubBinaryRelease(version, { ...options, installation });
  }

  return installPackageManagerRelease(version, { ...options, installation });
}

export function recommendedInstallCommand(
  version: string,
  installation: CurrentInstallation = detectCurrentInstallation(),
): string {
  if (installation.kind === UpdaterInstallationKind.packageManager) {
    return createInstallPlan(version).display;
  }
  return UpdaterConfig.commands.selfUpdate;
}

export async function checkForUpdate(options: FetchLatestOptions = {}): Promise<UpdateCheckResult> {
  const release = await fetchLatestRelease(options);
  const checkedAt = new Date().toISOString();
  const result: UpdateCheckResult = {
    current_version: VERSION,
    latest_version: release.version,
    update_available: compareVersions(release.version, VERSION) > 0,
    source: release.source,
    release_url: release.releaseUrl,
    checked_at: checkedAt,
    install_command: recommendedInstallCommand(release.version),
  };

  tryWriteUpdateState({
    last_checked_at: checkedAt,
    latest_version: release.version,
    source: release.source,
    release_url: release.releaseUrl,
  });

  return result;
}

function envDisablesAutomaticChecks(): boolean {
  const noUpdate = readEnv("ALTERTABLE_NO_UPDATE_CHECK");
  if (noUpdate === true) {
    return true;
  }

  const updateCheck = readEnv("ALTERTABLE_UPDATE_CHECK");
  return updateCheck === "0" || updateCheck === "false" || updateCheck === "never";
}

function intervalMs(interval: UpdateCheckInterval): number {
  return UpdaterConfig.intervalsMs[interval];
}

export function shouldRunAutomaticUpdateCheck(options: {
  context: CliContext;
  commandName?: string;
  state?: UpdateState;
  now?: Date;
  stderrIsTTY?: boolean;
}): boolean {
  if (!shouldShowAutomaticUpdateNotice(options)) {
    return false;
  }

  const interval = getUpdateCheckInterval();
  const state = options.state ?? readUpdateState();
  if (!state.last_checked_at) {
    return true;
  }

  const previous = Date.parse(state.last_checked_at);
  if (Number.isNaN(previous)) {
    return true;
  }
  const now = options.now ?? new Date();
  return now.getTime() - previous >= intervalMs(interval);
}

function shouldShowAutomaticUpdateNotice(options: {
  context: CliContext;
  commandName?: string;
  stderrIsTTY?: boolean;
}): boolean {
  if (isJsonOutput(options.context) || options.context.debug) {
    return false;
  }
  const stderrIsTTY = options.stderrIsTTY ?? process.stderr.isTTY;
  if (stderrIsTTY !== true) {
    return false;
  }
  if (readEnv("CI") || readEnv("TEST") || envDisablesAutomaticChecks()) {
    return false;
  }

  const command = options.commandName;
  if (!command || AUTO_SKIP_COMMANDS.has(command)) {
    return false;
  }

  const interval = getUpdateCheckInterval();
  if (interval === "never") {
    return false;
  }
  return true;
}

function writeAutomaticUpdateNotice(sink: OutputSink, latestVersion: string): void {
  sink.writeMetadata([
    "",
    renderDisplayText([
      span(`Update available: altertable ${latestVersion} (current ${VERSION}).`, "subtle"),
    ]),
    renderDisplayText([
      span(`Run ${recommendedInstallCommand(latestVersion)} to install it.`, "subtle"),
    ]),
  ]);
}

export async function maybeShowUpdateNotice(options: AutomaticNoticeOptions): Promise<void> {
  try {
    if (!shouldShowAutomaticUpdateNotice(options)) {
      return;
    }

    const sink = options.sink ?? getOutputSink();
    const previous = readUpdateState();
    let latestVersion = previous.latest_version;

    if (shouldRunAutomaticUpdateCheck({ ...options, state: previous })) {
      try {
        const result = await checkForUpdate({
          source: options.source,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs ?? UpdaterConfig.timeoutsMs.automatic,
        });
        latestVersion = result.latest_version;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown update check error.";
        tryWriteUpdateState({
          ...previous,
          last_checked_at: new Date().toISOString(),
          last_error: message,
        });
      }
    }

    if (latestVersion && compareVersions(latestVersion, VERSION) > 0) {
      writeAutomaticUpdateNotice(sink, latestVersion);
    }
  } catch {
    // Automatic update notices must never interrupt the command being run.
  }
}

export function formatUpdateResult(result: UpdateCheckResult, targetVersion?: string): string {
  if (targetVersion) {
    const target = normalizeVersion(targetVersion);
    const current = normalizeVersion(result.current_version);
    const comparison = compareVersions(target, current);
    if (comparison < 0) {
      return [
        renderDisplayText([
          span(`Target version v${target} is older than installed altertable v${current}.`),
        ]),
        renderDisplayText([
          span("Run "),
          span(`altertable update ${target} --force`, "accent"),
          span(" to install it anyway."),
        ]),
      ].join("\n");
    }
    if (comparison === 0) {
      return renderDisplayText([span(`Target version v${target} is already installed.`)]);
    }
  }

  if (!result.update_available) {
    return renderDisplayText([
      span("Congrats!", "success"),
      span(" You're already on the latest version of altertable "),
      span(`(which is v${normalizeVersion(result.current_version)})`, "subtle"),
    ]);
  }

  return [
    renderDisplayText([
      span(
        `A new version of altertable is available: v${normalizeVersion(result.latest_version)} `,
      ),
      span(`(current v${normalizeVersion(result.current_version)})`, "subtle"),
    ]),
    renderDisplayText([
      span("Run "),
      span(result.install_command, "accent"),
      span(" to install it."),
    ]),
  ].join("\n");
}
