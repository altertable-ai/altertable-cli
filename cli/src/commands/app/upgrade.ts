import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineCommand } from "@/lib/command.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { dataAppPayload } from "@/commands/app/lib/payload.ts";
import { copyProcessEnv } from "@/lib/env.ts";
import { appDirectory, requireAppScripts, runAppCommand } from "@/commands/app/lib/run.ts";
import { checkAppProject } from "@/commands/app/check.ts";
import { validateLegacyRuntime } from "@/commands/app/lib/legacy-runtime.ts";
import { legacyAppEdits } from "@/commands/app/lib/legacy-app.ts";
import {
  dataAppPackage,
  legacyRuntimePath,
  lockedVersion,
  readAppLock,
  readAppPackage,
  recommendedDataAppPeers,
  recommendedDataAppVersion,
} from "@/commands/app/lib/package.ts";

export const appUpgradeCommand = defineCommand({
  metadata: {
    name: "upgrade",
    description:
      "Update the data app package to the CLI's tested version, migrating vendored apps.",
    examples: ["altertable app upgrade", "altertable app upgrade --dir ./my-app"],
  },
  args: { dir: { type: "string", description: "App directory (default: current directory)." } },
  async run({ args, sink }) {
    const directory = appDirectory(args.dir);
    const upgraded = await upgradeApp(directory);
    const { packages } = readAppLock(
      await readFile(join(directory, "bun.lock"), "utf8"),
      directory,
    );
    const version = lockedVersion(packages, dataAppPackage)!;
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
          ? `Updated data app package to ${version}. Run \`altertable app check\`, then restart any running \`altertable app dev\` server.`
          : `Data app package ${version} is already current.`,
      );
    }
  },
});

type UpgradeOptions = {
  afterApply?: (path: string) => void | Promise<void>;
  resolveLock?: (directory: string) => Promise<void>;
  validateMigration?: (directory: string) => Promise<void>;
};
type Applied = { destination: string; backup: string | null };

/** Manifest, lockfile, migration edits, and runtime removal share one rollback boundary. */
export async function upgradeApp(
  directory: string,
  options: UpgradeOptions = {},
): Promise<boolean> {
  const version = recommendedDataAppVersion();
  const { manifest } = await readAppPackage(directory);
  const reference = manifest.dependencies?.[dataAppPackage];
  const legacy = reference === `file:${legacyRuntimePath}`;
  if (!reference || (!legacy && !/^[\d~^<>=*]/.test(reference))) {
    throw new ConfigurationError(
      `package.json must reference the published ${dataAppPackage} package or the generated vendored runtime.`,
    );
  }
  let lock: string;
  try {
    lock = await readFile(join(directory, "bun.lock"), "utf8");
  } catch {
    throw new ConfigurationError(`Cannot read a valid bun.lock in ${directory}.`);
  }
  const { packages } = readAppLock(lock, directory, reference);
  const installedVersion = lockedVersion(packages, dataAppPackage);
  if (!legacy && (!installedVersion || !Bun.semver.satisfies(installedVersion, reference))) {
    throw new ConfigurationError(
      "bun.lock does not resolve the declared data app package. Run bun install before upgrading.",
    );
  }
  if (legacy) await validateLegacyRuntime(directory);
  // A newer package installed intentionally must never be downgraded by an older CLI.
  if (!legacy && installedVersion && Bun.semver.order(installedVersion, version) > 0) return false;
  const defaults = JSON.parse(dataAppPayload.starter["package.json"]!).dependencies as Record<
    string,
    string
  >;
  let packageChanged = reference !== version;
  for (const [name, range] of Object.entries(recommendedDataAppPeers())) {
    const existing = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
    const resolved = lockedVersion(packages, name);
    if (
      existing &&
      resolved &&
      Bun.semver.satisfies(resolved, existing) &&
      Bun.semver.satisfies(resolved, range)
    )
      continue;
    if (existing)
      throw new ConfigurationError(
        `Data app package needs ${name}@${range}; app declares ${existing}. Update package.json and bun.lock before upgrading.`,
      );
    const fallback = defaults[name];
    if (!fallback || !Bun.semver.satisfies(fallback, range))
      throw new ConfigurationError(`Add ${name}@${range} before upgrading.`);
    manifest.dependencies![name] = fallback;
    packageChanged = true;
  }
  if (!legacy && !packageChanged) return false;
  const edits = legacy ? await legacyAppEdits(directory) : new Map<string, string>();
  manifest.dependencies![dataAppPackage] = version;
  const nextPackage = `${JSON.stringify(manifest, null, 2)}\n`;
  edits.set("package.json", nextPackage);
  edits.set("bun.lock", lock);
  const managedDirectory = join(directory, ".altertable");
  if ((await exists(managedDirectory)) && !(await lstat(managedDirectory)).isDirectory()) {
    throw new ConfigurationError(".altertable must be a real directory before upgrading.");
  }
  await mkdir(managedDirectory, { recursive: true });
  const transaction = await mkdtemp(join(directory, ".altertable", ".upgrade-"));
  const applied: Applied[] = [];
  let preserveBackup = false;
  async function apply(name: string, content?: string): Promise<void> {
    const destination = join(directory, name);
    const backup = join(transaction, "backup", name);
    const hadOriginal = await exists(destination);
    if (hadOriginal) {
      await mkdir(dirname(backup), { recursive: true });
      await rename(destination, backup);
    }
    applied.push({ destination, backup: hadOriginal ? backup : null });
    if (content !== undefined) await writeFile(destination, content);
    await options.afterApply?.(destination);
  }
  try {
    for (const [name, content] of edits) await apply(name, content);
    await (options.resolveLock ?? resolveLockfile)(directory);
    const resolved = readAppLock(
      await readFile(join(directory, "bun.lock"), "utf8"),
      directory,
      version,
    );
    if (lockedVersion(resolved.packages, dataAppPackage) !== version)
      throw new ConfigurationError(
        "Dependency resolution did not lock the tested data app version.",
      );
    for (const [name, range] of Object.entries(recommendedDataAppPeers())) {
      const peerVersion = lockedVersion(resolved.packages, name);
      if (!peerVersion || !Bun.semver.satisfies(peerVersion, range))
        throw new ConfigurationError(
          `Resolved ${name} is incompatible with data app's ${range} peer requirement.`,
        );
    }
    // Bun may rewrite the root manifest; preserve all unrelated app-owned fields.
    await writeFile(join(directory, "package.json"), nextPackage);
    if (legacy) {
      // Retain the original installation until the migrated consumer passes validation.
      await apply("node_modules");
      await (options.validateMigration ?? validateMigration)(directory);
      await apply(legacyRuntimePath);
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
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

/** Prove authored code can consume the new exports before deleting its runtime copy. */
async function validateMigration(directory: string): Promise<void> {
  requireAppScripts(directory, ["typecheck"]);
  const env = copyProcessEnv();
  for (const key of Object.keys(env)) if (key.startsWith("ALTERTABLE_")) delete env[key];
  const child = Bun.spawn([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: directory,
    env: { ...env, BUN_BE_BUN: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new ConfigurationError(
      `Could not install the migrated app; upgrade rolled back.\n${stderr || stdout}`,
    );
  if ((await runAppCommand("typecheck", directory)) !== 0) {
    throw new ConfigurationError(
      "The app needs source changes for the published package; upgrade rolled back. See https://github.com/altertable-ai/data-app/blob/main/docs/react.md#migration-from-the-earlier-runtime.",
    );
  }
  await checkAppProject(directory);
}
