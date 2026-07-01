import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { CliContext } from "@/context.ts";
import { isJsonOutput } from "@/context.ts";
import { CLI_PACKAGE_METADATA } from "@/package-metadata.ts";
import { VERSION } from "@/version.ts";
import { configDir, configGet, configSet } from "@/lib/config.ts";
import { urlencode } from "@/lib/encode.ts";
import { CliError, HttpError, NetworkError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { getOutputSink } from "@/lib/runtime.ts";
import { terminalMetadata } from "@/lib/terminal-style.ts";

const DAILY_MS = 24 * 60 * 60 * 1000;
const UPDATER_SOURCES = {
  npm: {
    registryUrl: "https://registry.npmjs.org",
    packageBaseUrl: "https://www.npmjs.com/package",
  },
  github: {
    apiBaseUrl: "https://api.github.com/repos",
    webBaseUrl: "https://github.com",
  },
} as const;

const UPDATE_INTERVALS_MS = {
  daily: DAILY_MS,
  weekly: 7 * DAILY_MS,
  never: Number.POSITIVE_INFINITY,
} as const;

const INSTALL_COMMANDS = {
  bun: { command: "bun", argsBeforePackage: ["install", "-g"] },
  npm: { command: "npm", argsBeforePackage: ["install", "-g"] },
  pnpm: { command: "pnpm", argsBeforePackage: ["add", "-g"] },
  yarn: { command: "yarn", argsBeforePackage: ["global", "add"] },
} as const;

const INSTALL_METHODS = {
  auto: {},
  "package-manager": {},
  "github-binary": {},
} as const;

const RELEASE_PLATFORMS = {
  "darwin-arm64": {},
  "darwin-x64": {},
  "linux-arm64": {},
  "linux-x64": {},
} as const;

const UPDATER_DEFAULTS = {
  source: "npm",
  checkInterval: "daily",
  installManager: "npm",
  installMethod: "auto",
} as const satisfies {
  source: keyof typeof UPDATER_SOURCES;
  checkInterval: keyof typeof UPDATE_INTERVALS_MS;
  installManager: keyof typeof INSTALL_COMMANDS;
  installMethod: keyof typeof INSTALL_METHODS;
};

export const UPDATER_CONFIG = {
  packageName: CLI_PACKAGE_METADATA.name,
  githubRepo: CLI_PACKAGE_METADATA.repositorySlug,
  stateFileName: "update-state.json",
  configKeys: {
    checkInterval: "update_check_interval",
  },
  defaults: UPDATER_DEFAULTS,
  env: {
    source: "ALTERTABLE_UPDATE_SOURCE",
    registryUrl: "ALTERTABLE_UPDATE_REGISTRY_URL",
    githubRepo: "ALTERTABLE_UPDATE_GITHUB_REPO",
    installer: "ALTERTABLE_UPDATE_INSTALLER",
    installMethod: "ALTERTABLE_UPDATE_INSTALL_METHOD",
    noUpdateCheck: "ALTERTABLE_NO_UPDATE_CHECK",
    updateCheck: "ALTERTABLE_UPDATE_CHECK",
    bunInstall: "BUN_INSTALL",
    ci: "CI",
    test: "TEST",
  },
  sources: UPDATER_SOURCES,
  timeoutsMs: {
    automatic: 900,
    manual: 10_000,
  },
  intervalsMs: UPDATE_INTERVALS_MS,
  automaticCheckSkipCommands: ["completion", "update"],
  installCommands: INSTALL_COMMANDS,
  installMethods: INSTALL_METHODS,
  releasePlatforms: RELEASE_PLATFORMS,
  binaryAssetPrefix: "altertable",
  checksumsAssetName: "checksums.txt",
} as const;

export type UpdateSource = keyof typeof UPDATER_CONFIG.sources;
export type UpdateCheckInterval = keyof typeof UPDATER_CONFIG.intervalsMs;
export type InstallManager = keyof typeof UPDATER_CONFIG.installCommands;
export type UpdateInstallMethod = keyof typeof UPDATER_CONFIG.installMethods;
export type ResolvedUpdateInstallMethod = Exclude<UpdateInstallMethod, "auto">;
export type ReleasePlatform = keyof typeof UPDATER_CONFIG.releasePlatforms;
export type InstallationKind = "native-binary" | "package-manager" | "source" | "unknown";

export const UPDATE_SOURCES = objectKeys(UPDATER_CONFIG.sources);
export const UPDATE_CHECK_INTERVALS = objectKeys(UPDATER_CONFIG.intervalsMs);
export const INSTALL_MANAGERS = objectKeys(UPDATER_CONFIG.installCommands);
export const UPDATE_INSTALL_METHODS = objectKeys(UPDATER_CONFIG.installMethods);

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

const AUTO_SKIP_COMMANDS: ReadonlySet<string> = new Set(UPDATER_CONFIG.automaticCheckSkipCommands);

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

function objectKeys<TValue extends Record<string, unknown>>(
  value: TValue,
): Array<Extract<keyof TValue, string>> {
  return Object.keys(value) as Array<Extract<keyof TValue, string>>;
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
  return join(configDir(), UPDATER_CONFIG.stateFileName);
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = join(tmpdir(), `altertable-update-${randomBytes(8).toString("hex")}`);
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, filePath);
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

export function clearUpdateState(): void {
  rmSync(updaterStateFile(), { force: true });
}

export function parseUpdateCheckInterval(value: string): UpdateCheckInterval | undefined {
  if (isAllowedValue(UPDATE_CHECK_INTERVALS, value)) {
    return value;
  }
  return undefined;
}

export function getUpdateCheckInterval(): UpdateCheckInterval {
  const fromConfig = parseUpdateCheckInterval(configGet(UPDATER_CONFIG.configKeys.checkInterval));
  return fromConfig ?? UPDATER_CONFIG.defaults.checkInterval;
}

export function setUpdateCheckInterval(interval: UpdateCheckInterval): void {
  configSet(UPDATER_CONFIG.configKeys.checkInterval, interval);
}

function parseUpdateSource(value: string | undefined): UpdateSource | undefined {
  if (isAllowedValue(UPDATE_SOURCES, value)) {
    return value;
  }
  return undefined;
}

function parseUpdateInstallMethod(value: string | undefined): UpdateInstallMethod | undefined {
  if (isAllowedValue(UPDATE_INSTALL_METHODS, value)) {
    return value;
  }
  return undefined;
}

export function resolveUpdateSource(source?: UpdateSource): UpdateSource {
  return (
    source ??
    parseUpdateSource(process.env[UPDATER_CONFIG.env.source]) ??
    UPDATER_CONFIG.defaults.source
  );
}

export function resolveUpdateInstallMethod(method?: UpdateInstallMethod): UpdateInstallMethod {
  return (
    method ??
    parseUpdateInstallMethod(process.env[UPDATER_CONFIG.env.installMethod]) ??
    UPDATER_CONFIG.defaults.installMethod
  );
}

function isAllowedValue<TValue extends string>(
  values: readonly TValue[],
  value: string | undefined,
): value is TValue {
  return value !== undefined && values.includes(value as TValue);
}

function isAllowedObjectKey<TValue extends Record<string, unknown>>(
  value: TValue,
  key: string,
): key is Extract<keyof TValue, string> {
  return key in value;
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
    process.env[UPDATER_CONFIG.env.registryUrl] ?? UPDATER_CONFIG.sources.npm.registryUrl;
  const url = new URL(registry);
  appendEncodedUrlPath(url, UPDATER_CONFIG.packageName, "latest");
  return url.toString();
}

function githubLatestReleaseUrl(): string {
  const repo = process.env[UPDATER_CONFIG.env.githubRepo] ?? UPDATER_CONFIG.githubRepo;
  const url = new URL(UPDATER_CONFIG.sources.github.apiBaseUrl);
  appendEncodedUrlPath(url, ...repoSegments(repo), "releases", "latest");
  return url.toString();
}

function githubReleaseMetadataUrl(version?: string): string {
  if (!version) {
    return githubLatestReleaseUrl();
  }
  const repo = process.env[UPDATER_CONFIG.env.githubRepo] ?? UPDATER_CONFIG.githubRepo;
  const url = new URL(UPDATER_CONFIG.sources.github.apiBaseUrl);
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
  const url = new URL(UPDATER_CONFIG.sources.github.webBaseUrl);
  appendEncodedUrlPath(url, ...repoSegments(UPDATER_CONFIG.githubRepo), "releases");
  return url.toString();
}

function githubReleaseTagUrl(version: string): string {
  const url = new URL(UPDATER_CONFIG.sources.github.webBaseUrl);
  appendEncodedUrlPath(
    url,
    ...repoSegments(UPDATER_CONFIG.githubRepo),
    "releases",
    "tag",
    `v${normalizeVersion(version)}`,
  );
  return url.toString();
}

export function packageReleaseUrl(version: string): string {
  const url = new URL(UPDATER_CONFIG.sources.npm.packageBaseUrl);
  appendEncodedUrlPath(url, UPDATER_CONFIG.packageName, "v", normalizeVersion(version));
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
  url.pathname = [...baseSegments, ...rawSegments.map(urlencode)]
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
        "User-Agent": `altertable-cli/${VERSION}`,
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
  if (isAllowedObjectKey(UPDATER_CONFIG.releasePlatforms, releasePlatform)) {
    return releasePlatform;
  }
  throw new CliError(`Unsupported self-update platform: ${platform}-${arch}.`, {
    details: `Download a release manually from ${githubReleasesFallbackUrl()}.`,
  });
}

export function releaseAssetName(platform: ReleasePlatform): string {
  return `${UPDATER_CONFIG.binaryAssetPrefix}-${platform}`;
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
  const timeoutMs = options.timeoutMs ?? UPDATER_CONFIG.timeoutsMs.manual;
  const fetchImpl = options.fetchImpl ?? fetch;
  const data = await fetchJson(githubReleaseMetadataUrl(options.version), timeoutMs, fetchImpl);
  const version = normalizeVersion(readStringProperty(data, "tag_name"));
  if (!version) {
    throw new CliError("GitHub release metadata did not include a tag_name.");
  }

  return {
    version,
    releaseUrl: readStringProperty(data, "html_url") || githubReleaseTagUrl(version),
    assetName,
    assetDownloadUrl: findGitHubAsset(data, assetName),
    checksumsDownloadUrl: findGitHubAsset(data, UPDATER_CONFIG.checksumsAssetName),
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
  const timeoutMs = options.timeoutMs ?? UPDATER_CONFIG.timeoutsMs.manual;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (source === "github") {
    const data = await fetchJson(githubLatestReleaseUrl(), timeoutMs, fetchImpl);
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

  const data = await fetchJson(npmRegistryUrl(), timeoutMs, fetchImpl);
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

export function detectInstallManager(env: NodeJS.ProcessEnv = process.env): InstallManager {
  const override = env[UPDATER_CONFIG.env.installer];
  if (isAllowedValue(INSTALL_MANAGERS, override)) {
    return override;
  }

  const userAgent = env.npm_config_user_agent ?? "";
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
  if (env[UPDATER_CONFIG.env.bunInstall]) {
    return "bun";
  }
  return UPDATER_CONFIG.defaults.installManager;
}

export function createInstallPlan(
  version: string,
  manager: InstallManager = detectInstallManager(),
): InstallPlan {
  const packageSpecifier = `${UPDATER_CONFIG.packageName}@${normalizeVersion(version)}`;
  const plan = UPDATER_CONFIG.installCommands[manager];
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

export function detectCurrentInstallation(
  options: {
    execPath?: string;
    argv?: readonly string[];
  } = {},
): CurrentInstallation {
  const execPath = options.execPath ?? process.execPath;
  const argv = options.argv ?? process.argv;
  const scriptPath = argv[1] ?? "";
  const execName = basename(execPath);
  const scriptName = basename(scriptPath);

  if (pathEndsWith(scriptPath, "/src/cli.ts") || scriptName.endsWith(".ts")) {
    return {
      kind: "source",
      executablePath: scriptPath || execPath,
      reason: "running from TypeScript source",
    };
  }

  if (pathEndsWith(scriptPath, "/dist/cli.js") || scriptName === "cli.js") {
    return {
      kind: "package-manager",
      executablePath: scriptPath || execPath,
      reason: "running the packaged JavaScript bundle",
    };
  }

  if (scriptName.endsWith(".js")) {
    return {
      kind: "package-manager",
      executablePath: scriptPath,
      reason: "running a JavaScript package entrypoint",
    };
  }

  if (execName === "altertable" || execName.startsWith(`${UPDATER_CONFIG.binaryAssetPrefix}-`)) {
    return {
      kind: "native-binary",
      executablePath: execPath,
      reason: "running a native release binary",
    };
  }

  if (execName === "bun" || execName.startsWith("bun-")) {
    return {
      kind: "source",
      executablePath: scriptPath || execPath,
      reason: "running under Bun",
    };
  }

  return {
    kind: "unknown",
    executablePath: execPath,
    reason: "unable to identify installation origin",
  };
}

export function resolveCurrentExecutablePath(): string {
  return detectCurrentInstallation().executablePath;
}

export function isNativeCompiledInstall(
  executablePath: string = process.execPath,
  argv: readonly string[] = process.argv,
): boolean {
  return detectCurrentInstallation({ execPath: executablePath, argv }).kind === "native-binary";
}

function resolveInstallMethodForInstallation(
  requestedMethod: UpdateInstallMethod,
  installation: CurrentInstallation,
): ResolvedUpdateInstallMethod {
  if (requestedMethod !== "auto") {
    return requestedMethod;
  }
  if (installation.kind === "native-binary") {
    return "github-binary";
  }
  if (installation.kind === "package-manager") {
    return "package-manager";
  }
  throw new CliError("Automatic CLI install is not supported for this checkout.", {
    details:
      "Source checkouts should be updated with git, or pass --install-method package-manager to install the published package globally.",
  });
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
): string {
  const result = spawnImpl(command, ["--version"], { encoding: "utf8" });
  if (result.error) {
    throw new CliError(`Unable to verify installed altertable version.`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new CliError(
      `Installed altertable version check failed with exit code ${result.status ?? 1}.`,
    );
  }
  const installedVersion = normalizeVersion(spawnOutputText(result.stdout).trim());
  if (compareVersions(installedVersion, expectedVersion) !== 0) {
    throw new CliError(
      `Installed altertable version is ${installedVersion || "unknown"}, expected ${normalizeVersion(
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

export async function installGitHubBinaryRelease(
  version: string,
  options: InstallCliUpdateOptions = {},
): Promise<UpdateInstallResult> {
  const installation = options.installation ?? detectCurrentInstallation();
  const targetPath = options.targetPath ?? installation.executablePath;
  if (!options.targetPath && installation.kind !== "native-binary") {
    throw new CliError("Self-update is only supported for native release binaries.", {
      details:
        "Use --install-method package-manager for npm-style installs, or pass --target-path for controlled binary replacement.",
    });
  }

  const timeoutMs = options.timeoutMs ?? UPDATER_CONFIG.timeoutsMs.manual;
  const fetchImpl = options.fetchImpl ?? fetch;
  const release = await fetchGitHubBinaryRelease({
    version,
    platform: options.platform,
    timeoutMs,
    fetchImpl,
  });
  const tempPath = tempSiblingPath(targetPath, "download");
  try {
    const bytes = await fetchBytes(release.assetDownloadUrl, timeoutMs, fetchImpl);
    writeFileSync(tempPath, bytes, { mode: 0o755 });
    const checksumsText = await fetchText(release.checksumsDownloadUrl, timeoutMs, fetchImpl);
    const expectedHash = parseChecksums(checksumsText).get(release.assetName);
    if (!expectedHash) {
      throw new CliError(`Checksum file did not include ${release.assetName}.`);
    }
    if (!verifySha256(tempPath, expectedHash)) {
      throw new CliError(`Checksum verification failed for ${release.assetName}.`);
    }
    chmodSync(tempPath, 0o755);
    replaceFileAtomically(targetPath, tempPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError("Unable to install GitHub release binary.", { cause: error });
  }

  const verifiedVersion =
    options.verify === false
      ? release.version
      : verifyInstalledCliVersion(release.version, targetPath, options.spawnImpl);
  return {
    installed_version: release.version,
    verified_version: verifiedVersion,
    method: "github-binary",
    target_path: targetPath,
  };
}

export function runInstallPlan(plan: InstallPlan, options: RunInstallPlanOptions = {}): string {
  const stdio = options.stdio ?? "inherit";
  const result = (options.spawnImpl ?? spawnSync)(plan.command, plan.args, { stdio });
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
  return verifyInstalledCliVersion(
    options.expectedVersion ?? plan.args[plan.args.length - 1]?.split("@").pop() ?? "",
    options.verifyCommand ?? "altertable",
    options.spawnImpl,
  );
}

export async function installCliUpdate(
  version: string,
  options: InstallCliUpdateOptions = {},
): Promise<UpdateInstallResult> {
  const installation = options.installation ?? detectCurrentInstallation();
  const requestedMethod = resolveUpdateInstallMethod(options.method);
  const method = resolveInstallMethodForInstallation(requestedMethod, installation);

  if (method === "github-binary") {
    return await installGitHubBinaryRelease(version, { ...options, installation });
  }

  const plan = createInstallPlan(version);
  const verifiedVersion = runInstallPlan(plan, {
    stdio: options.stdio,
    spawnImpl: options.spawnImpl,
    expectedVersion: version,
    verify: options.verify,
  });
  return {
    installed_version: normalizeVersion(version),
    verified_version: verifiedVersion || normalizeVersion(version),
    method: "package-manager",
    manager: plan.manager,
    command: plan.display,
  };
}

export function recommendedInstallCommand(
  version: string,
  installation: CurrentInstallation = detectCurrentInstallation(),
): string {
  try {
    const method = resolveInstallMethodForInstallation(
      UPDATER_CONFIG.defaults.installMethod,
      installation,
    );
    if (method === "github-binary") {
      return "altertable update --install";
    }
  } catch {
    return "altertable update --install --install-method package-manager";
  }
  return createInstallPlan(version).display;
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
  const noUpdate = process.env[UPDATER_CONFIG.env.noUpdateCheck];
  if (noUpdate === "1" || noUpdate === "true") {
    return true;
  }

  const updateCheck = process.env[UPDATER_CONFIG.env.updateCheck];
  return updateCheck === "0" || updateCheck === "false" || updateCheck === "never";
}

function intervalMs(interval: UpdateCheckInterval): number {
  return UPDATER_CONFIG.intervalsMs[interval];
}

export function shouldRunAutomaticUpdateCheck(options: {
  context: CliContext;
  commandName?: string;
  state?: UpdateState;
  now?: Date;
  stderrIsTTY?: boolean;
}): boolean {
  if (isJsonOutput(options.context) || options.context.debug) {
    return false;
  }
  const stderrIsTTY = options.stderrIsTTY ?? process.stderr.isTTY;
  if (stderrIsTTY !== true) {
    return false;
  }
  if (
    process.env[UPDATER_CONFIG.env.ci] ||
    process.env[UPDATER_CONFIG.env.test] ||
    envDisablesAutomaticChecks()
  ) {
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

export async function maybeShowUpdateNotice(options: AutomaticNoticeOptions): Promise<void> {
  if (!shouldRunAutomaticUpdateCheck(options)) {
    return;
  }

  const sink = options.sink ?? getOutputSink();
  try {
    const result = await checkForUpdate({
      source: options.source,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs ?? UPDATER_CONFIG.timeoutsMs.automatic,
    });
    if (!result.update_available) {
      return;
    }

    sink.writeMetadata([
      "",
      terminalMetadata(
        `Update available: altertable ${result.latest_version} (current ${result.current_version}).`,
      ),
      terminalMetadata(`Run ${result.install_command} or altertable update --install.`),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown update check error.";
    const previous = readUpdateState();
    tryWriteUpdateState({
      ...previous,
      last_checked_at: new Date().toISOString(),
      last_error: message,
    });
  }
}

export function formatUpdateResult(result: UpdateCheckResult): string {
  if (!result.update_available) {
    return `altertable is up to date (${result.current_version}).`;
  }

  return [
    `altertable ${result.latest_version} is available (current ${result.current_version}).`,
    `Install: ${result.install_command}`,
    `Release: ${result.release_url}`,
  ].join("\n");
}

export function formatUpdateStatus(interval: UpdateCheckInterval, state: UpdateState): string {
  const lines = [`Auto update checks: ${interval}`];
  if (state.last_checked_at) {
    lines.push(`Last checked: ${state.last_checked_at}`);
  }
  if (state.latest_version) {
    lines.push(`Cached latest: ${state.latest_version}`);
  }
  if (state.last_error) {
    lines.push(`Last error: ${state.last_error}`);
  }
  if (!existsSync(updaterStateFile())) {
    lines.push("Cache: empty");
  }
  return lines.join("\n");
}
