import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineCommand } from "@/lib/command.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { dataAppPayload } from "@/commands/app/lib/payload.ts";
import { copyProcessEnv } from "@/lib/env.ts";
import { isRecord } from "@/lib/object.ts";
import { appDirectory } from "@/commands/app/lib/run.ts";
import {
  currentRuntimeIntegrity,
  installedRuntimeIntegrity,
  runtimeFiles,
  runtimePath,
} from "@/commands/app/lib/runtime.ts";

export const appUpgradeCommand = defineCommand({
  metadata: {
    name: "upgrade",
    description: "Update an unmodified data app runtime to the CLI's current version.",
    examples: ["altertable app upgrade", "altertable app upgrade --dir ./my-app"],
  },
  args: { dir: { type: "string", description: "App directory (default: current directory)." } },
  async run({ args, sink }) {
    const directory = appDirectory(args.dir);
    const upgraded = await upgradeApp(directory);
    const version = currentRuntimeIntegrity().version;
    if (sink.json) {
      sink.writeJson({
        directory,
        upgraded,
        runtimeVersion: version,
        nextSteps: upgraded
          ? [
              "Run `altertable app check` in the app directory.",
              "Restart any running `altertable app dev` server.",
            ]
          : [],
      });
    } else {
      sink.writeHuman(
        upgraded
          ? `Updated data app runtime to ${version}. Run \`altertable app check\`, then restart any running \`altertable app dev\` server.`
          : `Data app runtime ${version} is already current.`,
      );
    }
  },
});

type UpgradeOptions = {
  afterApply?: (path: string) => void | Promise<void>;
  runtimeFiles?: Record<string, string>;
  resolveLock?: (directory: string) => Promise<void>;
};
type Applied = { destination: string; backup: string | null };

function parseJsonc(source: string): unknown {
  let withoutComments = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    const next = source[index + 1];
    if (inString) {
      withoutComments += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
      withoutComments += character;
    } else if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index++;
      withoutComments += "\n";
    } else if (character === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/"))
        index++;
      if (index >= source.length) throw new Error("Unterminated JSONC comment");
      index++;
      withoutComments += " ";
    } else {
      withoutComments += character;
    }
  }
  if (inString) throw new Error("Unterminated JSONC string");
  let withoutTrailingCommas = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index++) {
    const character = withoutComments[index]!;
    if (inString) {
      withoutTrailingCommas += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
      withoutTrailingCommas += character;
    } else if (character === "," && /^[\s]*[}\]]/.test(withoutComments.slice(index + 1))) {
      continue;
    } else {
      withoutTrailingCommas += character;
    }
  }
  return JSON.parse(withoutTrailingCommas) as unknown;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function readLock(lock: string, directory: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = parseJsonc(lock);
  } catch {
    throw new ConfigurationError(`Cannot read a valid bun.lock in ${directory}.`);
  }
  const workspaces = isRecord(value) && value.workspaces;
  const root = isRecord(workspaces) && workspaces[""];
  const dependencies = isRecord(root) && root.dependencies;
  if (
    !isRecord(value) ||
    !isRecord(value.packages) ||
    !isRecord(dependencies) ||
    !Object.values(dependencies).some((reference) => reference === `file:${runtimePath}`)
  ) {
    throw new ConfigurationError("bun.lock does not reference the generated runtime.");
  }
  return value.packages;
}

/** Upgrade from validated inputs. Staged replacements are swapped into place and rolled back on failure. */
export async function upgradeApp(
  directory: string,
  options: UpgradeOptions = {},
): Promise<boolean> {
  const files: Record<string, string> = options.runtimeFiles ?? runtimeFiles;
  const installed = await installedRuntimeIntegrity(directory);
  const current = currentRuntimeIntegrity(files);
  const runtimeUnchanged =
    installed.version === current.version &&
    Object.keys(installed.sha256).length === Object.keys(current.sha256).length &&
    Object.entries(current.sha256).every(([name, checksum]) => installed.sha256[name] === checksum);

  const lockPath = join(directory, "bun.lock");
  let lock: string;
  try {
    lock = await readFile(lockPath, "utf8");
  } catch {
    throw new ConfigurationError(`Cannot read a valid bun.lock in ${directory}.`);
  }
  const lockedPackages = readLock(lock, directory);
  const packagePath = join(directory, "package.json");
  const packageSource = await readFile(packagePath, "utf8");
  const appPackage = JSON.parse(packageSource) as PackageManifest;
  if (appPackage.dependencies?.["@altertable/data-app"] !== `file:${runtimePath}`) {
    throw new ConfigurationError("package.json does not reference the generated runtime.");
  }
  const previousPackage = JSON.parse(
    await readFile(join(directory, runtimePath, "package.json"), "utf8"),
  ) as PackageManifest;
  const nextPackage = JSON.parse(files["package.json"]!) as PackageManifest;
  const defaults = JSON.parse(dataAppPayload.starter["package.json"]!) as PackageManifest;
  let packageChanged = false;
  for (const [name, range] of Object.entries(nextPackage.peerDependencies ?? {})) {
    const existing = appPackage.dependencies?.[name] ?? appPackage.devDependencies?.[name];
    const locked = lockedPackages[name];
    const locator = Array.isArray(locked) && typeof locked[0] === "string" ? locked[0] : "";
    const resolvedVersion = locator.startsWith(`${name}@`) ? locator.slice(name.length + 1) : "";
    // A lockfile version proves compatibility for user-authored ranges such as ^19.
    if (
      existing &&
      (satisfies(existing, range) ||
        (satisfies(resolvedVersion, existing) && satisfies(resolvedVersion, range)))
    )
      continue;
    if (existing)
      throw new ConfigurationError(
        `Runtime needs ${name}@${range}; app declares ${existing}. Update package.json before upgrading.`,
      );
    const version = defaults.dependencies?.[name];
    if (!version || !satisfies(version, range))
      throw new ConfigurationError(
        `Runtime needs ${name}@${range}. Add a compatible dependency to package.json before upgrading.`,
      );
    appPackage.dependencies ??= {};
    appPackage.dependencies[name] = version;
    packageChanged = true;
  }
  if (runtimeUnchanged && !packageChanged) return false;
  const resolveDependencies =
    packageChanged ||
    JSON.stringify(previousPackage.dependencies) !== JSON.stringify(nextPackage.dependencies) ||
    JSON.stringify(previousPackage.peerDependencies) !==
      JSON.stringify(nextPackage.peerDependencies);
  const transaction = await mkdtemp(join(directory, ".altertable", ".upgrade-"));
  const applied: Applied[] = [];
  let preserveBackup = false;
  try {
    const target = join(directory, runtimePath);
    const stagedRuntime = join(transaction, "stage-runtime");
    if (await exists(target)) await cp(target, stagedRuntime, { recursive: true });
    else await mkdir(stagedRuntime);
    for (const [name, content] of Object.entries(files)) {
      const path = join(stagedRuntime, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    for (const name of Object.keys(installed.sha256)) {
      if (!(name in files)) await rm(join(stagedRuntime, name));
    }
    await writeFile(join(stagedRuntime, "integrity.json"), `${JSON.stringify(current, null, 2)}\n`);
    async function apply(staged: string, destination: string, name: string): Promise<void> {
      const backup = join(transaction, "backup", name);
      const hadOriginal = await exists(destination);
      if (hadOriginal) {
        await mkdir(dirname(backup), { recursive: true });
        await rename(destination, backup);
      }
      applied.push({ destination, backup: hadOriginal ? backup : null });
      await rename(staged, destination);
      await options.afterApply?.(destination);
    }
    await apply(stagedRuntime, target, "runtime");
    if (resolveDependencies) {
      const stagedPackage = join(transaction, "package.json");
      await writeFile(
        stagedPackage,
        packageChanged ? `${JSON.stringify(appPackage, null, 2)}\n` : packageSource,
      );
      await apply(stagedPackage, packagePath, "package.json");
      const stagedLock = join(transaction, "bun.lock");
      await writeFile(stagedLock, lock);
      await apply(stagedLock, lockPath, "bun.lock");
      await (options.resolveLock ?? resolveLockfile)(directory);
      readLock(await readFile(lockPath, "utf8"), directory);
      // Bun update may rewrite the root manifest; preserve all app-owned fields and formatting.
      await writeFile(
        packagePath,
        packageChanged ? `${JSON.stringify(appPackage, null, 2)}\n` : packageSource,
      );
    }
  } catch (error) {
    const rollbackFailures: string[] = [];
    for (const replacement of applied.reverse()) {
      try {
        await rm(replacement.destination, { recursive: true, force: true });
        if (replacement.backup) await rename(replacement.backup, replacement.destination);
      } catch {
        rollbackFailures.push(replacement.destination);
      }
    }
    if (rollbackFailures.length) {
      preserveBackup = true;
      throw new ConfigurationError(
        `Upgrade failed and rollback was incomplete. Backups remain at ${transaction}.`,
      );
    }
    throw error;
  } finally {
    if (!preserveBackup) await rm(transaction, { recursive: true, force: true });
  }
  return true;
}

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function satisfies(version: string, range: string): boolean {
  try {
    return Bun.semver.satisfies(version, range);
  } catch {
    return false;
  }
}

async function resolveLockfile(directory: string): Promise<void> {
  const env = copyProcessEnv();
  for (const key of Object.keys(env)) if (key.startsWith("ALTERTABLE_")) delete env[key];
  const child = Bun.spawn(
    [process.execPath, "update", "@altertable/data-app", "--lockfile-only", "--ignore-scripts"],
    {
      cwd: directory,
      env: { ...env, BUN_BE_BUN: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new ConfigurationError(
      `Could not resolve runtime dependencies; upgrade rolled back.\n${stderr || stdout}`,
    );
}
