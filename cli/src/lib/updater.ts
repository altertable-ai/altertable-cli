import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { CliContext } from "@/context.ts";
import { isJsonOutput } from "@/context.ts";
import { VERSION } from "@/version.ts";
import { configDir, configGet, configSet } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { getOutputSink } from "@/lib/runtime.ts";
import { terminalMetadata } from "@/lib/terminal-style.ts";

export type UpdateSource = "npm" | "github";
export type UpdateCheckInterval = "daily" | "weekly" | "never";
export type InstallManager = "bun" | "npm" | "pnpm" | "yarn";

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

type AutomaticNoticeOptions = FetchLatestOptions & {
  context: CliContext;
  rawArgs: readonly string[];
  sink?: OutputSink;
  now?: Date;
  stderrIsTTY?: boolean;
};

const PACKAGE_NAME = "@altertable/cli";
const ENCODED_PACKAGE_NAME = "@altertable%2Fcli";
const DEFAULT_GITHUB_REPO = "altertable-ai/altertable-cli";
const DEFAULT_UPDATE_SOURCE: UpdateSource = "npm";
const DEFAULT_UPDATE_INTERVAL: UpdateCheckInterval = "daily";
const UPDATE_CHECK_INTERVAL_KEY = "update_check_interval";
const DAILY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * DAILY_MS;
const AUTOMATIC_CHECK_TIMEOUT_MS = 900;
const MANUAL_CHECK_TIMEOUT_MS = 10_000;
const GLOBAL_VALUE_FLAGS = new Set(["--profile", "--connect-timeout", "--read-timeout"]);
const AUTO_SKIP_COMMANDS = new Set(["completion", "update"]);

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
  return join(configDir(), "update-state.json");
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

export function clearUpdateState(): void {
  rmSync(updaterStateFile(), { force: true });
}

export function parseUpdateCheckInterval(value: string): UpdateCheckInterval | undefined {
  if (value === "daily" || value === "weekly" || value === "never") {
    return value;
  }
  return undefined;
}

export function getUpdateCheckInterval(): UpdateCheckInterval {
  const fromConfig = parseUpdateCheckInterval(configGet(UPDATE_CHECK_INTERVAL_KEY));
  return fromConfig ?? DEFAULT_UPDATE_INTERVAL;
}

export function setUpdateCheckInterval(interval: UpdateCheckInterval): void {
  configSet(UPDATE_CHECK_INTERVAL_KEY, interval);
}

function parseUpdateSource(value: string | undefined): UpdateSource | undefined {
  if (value === "npm" || value === "github") {
    return value;
  }
  return undefined;
}

export function resolveUpdateSource(source?: UpdateSource): UpdateSource {
  return source ?? parseUpdateSource(process.env.ALTERTABLE_UPDATE_SOURCE) ?? DEFAULT_UPDATE_SOURCE;
}

function npmRegistryUrl(): string {
  const registry = process.env.ALTERTABLE_UPDATE_REGISTRY_URL ?? "https://registry.npmjs.org";
  return `${registry.replace(/\/$/, "")}/${ENCODED_PACKAGE_NAME}/latest`;
}

function githubLatestReleaseUrl(): string {
  const repo = process.env.ALTERTABLE_UPDATE_GITHUB_REPO ?? DEFAULT_GITHUB_REPO;
  return `https://api.github.com/repos/${repo}/releases/latest`;
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<unknown> {
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
    throw new CliError("Unable to check for CLI updates.", { cause: error });
  }

  if (!response.ok) {
    throw new CliError(`Unable to check for CLI updates (HTTP ${response.status}).`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new CliError("Update metadata was not valid JSON.", { cause: error });
  }
}

function readStringProperty(data: unknown, key: string): string {
  if (typeof data !== "object" || data === null || !(key in data)) {
    return "";
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export async function fetchLatestRelease(options: FetchLatestOptions = {}): Promise<ReleaseInfo> {
  const source = resolveUpdateSource(options.source);
  const timeoutMs = options.timeoutMs ?? MANUAL_CHECK_TIMEOUT_MS;
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
      releaseUrl:
        readStringProperty(data, "html_url") ||
        "https://github.com/altertable-ai/altertable-cli/releases",
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
    releaseUrl: `https://www.npmjs.com/package/${PACKAGE_NAME}/v/${version}`,
  };
}

export function detectInstallManager(env: NodeJS.ProcessEnv = process.env): InstallManager {
  const override = env.ALTERTABLE_UPDATE_INSTALLER;
  if (override === "bun" || override === "npm" || override === "pnpm" || override === "yarn") {
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
  if (env.BUN_INSTALL) {
    return "bun";
  }
  return "npm";
}

export function createInstallPlan(
  version: string,
  manager: InstallManager = detectInstallManager(),
): InstallPlan {
  const packageSpecifier = `${PACKAGE_NAME}@${normalizeVersion(version)}`;
  const plans: Record<InstallManager, { command: string; args: string[] }> = {
    bun: { command: "bun", args: ["install", "-g", packageSpecifier] },
    npm: { command: "npm", args: ["install", "-g", packageSpecifier] },
    pnpm: { command: "pnpm", args: ["add", "-g", packageSpecifier] },
    yarn: { command: "yarn", args: ["global", "add", packageSpecifier] },
  };
  const plan = plans[manager];
  return {
    manager,
    command: plan.command,
    args: plan.args,
    display: [plan.command, ...plan.args].join(" "),
  };
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
    install_command: createInstallPlan(release.version).display,
  };

  writeUpdateState({
    last_checked_at: checkedAt,
    latest_version: release.version,
    source: release.source,
    release_url: release.releaseUrl,
  });

  return result;
}

function envDisablesAutomaticChecks(): boolean {
  const noUpdate = process.env.ALTERTABLE_NO_UPDATE_CHECK;
  if (noUpdate === "1" || noUpdate === "true") {
    return true;
  }

  const updateCheck = process.env.ALTERTABLE_UPDATE_CHECK;
  return updateCheck === "0" || updateCheck === "false" || updateCheck === "never";
}

function firstTopLevelCommand(rawArgs: readonly string[]): string | undefined {
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--") {
      return undefined;
    }
    if (arg.startsWith("-")) {
      const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
      if (!arg.includes("=") && GLOBAL_VALUE_FLAGS.has(flag)) {
        index += 1;
      }
      continue;
    }
    return arg;
  }
  return undefined;
}

function intervalMs(interval: UpdateCheckInterval): number {
  return interval === "weekly" ? WEEKLY_MS : DAILY_MS;
}

export function shouldRunAutomaticUpdateCheck(options: {
  context: CliContext;
  rawArgs: readonly string[];
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
  if (process.env.CI || process.env.TEST || envDisablesAutomaticChecks()) {
    return false;
  }

  const command = firstTopLevelCommand(options.rawArgs);
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
      timeoutMs: options.timeoutMs ?? AUTOMATIC_CHECK_TIMEOUT_MS,
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
    writeUpdateState({
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

export function runInstallPlan(plan: InstallPlan): void {
  const result = spawnSync(plan.command, plan.args, { stdio: "inherit" });
  if (result.error) {
    throw new CliError(`Unable to run ${plan.command}.`, { cause: result.error });
  }
  if (result.signal) {
    throw new CliError(`Update command was interrupted by ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new CliError(`Update command failed with exit code ${result.status ?? 1}.`);
  }
}
