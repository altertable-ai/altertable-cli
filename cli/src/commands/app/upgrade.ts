import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '@/lib/command.ts';
import { ConfigurationError } from '@/lib/errors.ts';
import { dataAppPayload } from '@/commands/app/lib/payload.ts';
import { appDirectory } from '@/commands/app/lib/run.ts';
import { copyProcessEnv } from '@/lib/env.ts';
import {
  dataAppPackage,
  dataAppPackages,
  lockedVersion,
  readAppLock,
  readAppPackage,
  recommendedDataAppPeers,
  recommendedDataAppVersion,
} from '@/commands/app/lib/package.ts';

export const appUpgradeCommand = defineCommand({
  metadata: {
    name: 'upgrade',
    description:
      "Update a local data app's package to the CLI's tested version.",
    examples: [
      'altertable app upgrade',
      'altertable app upgrade --dir ./my-app',
    ],
  },
  args: {
    dir: {
      type: 'string',
      description: 'App directory (default: current directory).',
    },
  },
  async run({ args, sink }) {
    const directory = appDirectory(args.dir);
    const upgraded = await upgradeApp(directory);
    const { packages } = readAppLock(
      await readFile(join(directory, 'bun.lock'), 'utf8'),
      directory
    );
    const version = lockedVersion(packages, dataAppPackage)!;
    if (sink.json) {
      sink.writeJson({
        directory,
        upgraded,
        runtimeVersion: version,
        nextSteps: upgraded
          ? [
              'Run `altertable app lint` in the app directory.',
              'Restart any running `altertable app dev` server.',
            ]
          : [],
      });
    } else {
      sink.writeHuman(
        upgraded
          ? `Updated data app package to ${version}. Run \`altertable app lint\`, then restart any running \`altertable app dev\` server.`
          : `Data app package ${version} is already current.`
      );
    }
  },
});

type UpgradeOptions = {
  resolveLock?: (directory: string) => Promise<void>;
};

/** Update only the package manifest and lockfile; restore both if resolution fails. */
export async function upgradeApp(
  directory: string,
  options: UpgradeOptions = {}
): Promise<boolean> {
  const version = recommendedDataAppVersion();
  const { source: originalPackage, manifest } = await readAppPackage(directory);
  const reference = manifest.dependencies?.[dataAppPackage];
  if (!reference || !/^[\d~^<>=*]/.test(reference)) {
    throw new ConfigurationError(
      `package.json must reference the published ${dataAppPackage} package.`
    );
  }
  let lock: string;
  try {
    lock = await readFile(join(directory, 'bun.lock'), 'utf8');
  } catch {
    throw new ConfigurationError(
      `Cannot read a valid bun.lock in ${directory}.`
    );
  }
  const { packages } = readAppLock(lock, directory, reference);
  const dependencies = {
    ...manifest.devDependencies,
    ...manifest.dependencies,
  };
  const names = dataAppPackages.filter(
    name => dependencies[name] !== undefined
  );
  for (const name of names) {
    const declared = dependencies[name]!;
    if (!/^[\d~^<>=*]/.test(declared))
      throw new ConfigurationError(
        `package.json must reference the published ${name} package.`
      );
    const locked = readAppLock(lock, directory, declared, name);
    const resolved = lockedVersion(locked.packages, name);
    if (!resolved || !Bun.semver.satisfies(resolved, declared))
      throw new ConfigurationError(
        `bun.lock does not resolve the declared ${name} package. Run bun install before upgrading.`
      );
    // Never partially upgrade or downgrade a newer split-package installation.
    if (Bun.semver.order(resolved, version) > 0) return false;
  }
  const defaults = JSON.parse(dataAppPayload.starter['package.json']!)
    .dependencies as Record<string, string>;
  let packageChanged = names.some(name => dependencies[name] !== version);
  const peers = recommendedDataAppPeers(names);
  for (const [name, range] of Object.entries(peers)) {
    const existing =
      manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
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
        `Data app package needs ${name}@${range}; app declares ${existing}. Update package.json and bun.lock before upgrading.`
      );
    const fallback = defaults[name];
    if (!fallback || !Bun.semver.satisfies(fallback, range))
      throw new ConfigurationError(`Add ${name}@${range} before upgrading.`);
    manifest.dependencies![name] = fallback;
    packageChanged = true;
  }
  if (!packageChanged) return false;
  for (const name of names) {
    if (manifest.dependencies?.[name] !== undefined)
      manifest.dependencies[name] = version;
    if (manifest.devDependencies?.[name] !== undefined)
      manifest.devDependencies[name] = version;
  }
  const nextPackage = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    await writeFile(join(directory, 'package.json'), nextPackage);
    await (options.resolveLock ?? resolveLockfile)(directory);
    const resolvedLock = await readFile(join(directory, 'bun.lock'), 'utf8');
    const resolved = readAppLock(resolvedLock, directory, version);
    for (const name of names) {
      readAppLock(resolvedLock, directory, version, name);
      if (lockedVersion(resolved.packages, name) !== version)
        throw new ConfigurationError(
          `Dependency resolution did not lock the tested ${name} version.`
        );
    }
    for (const [name, range] of Object.entries(peers)) {
      const peerVersion = lockedVersion(resolved.packages, name);
      if (!peerVersion || !Bun.semver.satisfies(peerVersion, range))
        throw new ConfigurationError(
          `Resolved ${name} is incompatible with data app's ${range} peer requirement.`
        );
    }
    // Bun may rewrite the root manifest; preserve all unrelated app-owned fields.
    await writeFile(join(directory, 'package.json'), nextPackage);
  } catch (error) {
    const restored = await Promise.allSettled([
      writeFile(join(directory, 'package.json'), originalPackage),
      writeFile(join(directory, 'bun.lock'), lock),
    ]);
    if (restored.some(result => result.status === 'rejected'))
      throw new ConfigurationError(
        'Upgrade failed and could not restore package.json and bun.lock.',
        { cause: error }
      );
    throw error;
  }
  return true;
}

async function resolveLockfile(directory: string): Promise<void> {
  const env = copyProcessEnv();
  for (const key of Object.keys(env))
    if (key.startsWith('ALTERTABLE_')) delete env[key];
  const { manifest } = await readAppPackage(directory);
  const names = dataAppPackages.filter(
    name =>
      manifest.dependencies?.[name] !== undefined ||
      manifest.devDependencies?.[name] !== undefined
  );
  const child = Bun.spawn(
    [
      process.execPath,
      'update',
      ...names,
      '--lockfile-only',
      '--ignore-scripts',
    ],
    {
      cwd: directory,
      env: { ...env, BUN_BE_BUN: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new ConfigurationError(
      `Could not resolve data app dependencies; upgrade rolled back.\n${stderr || stdout}`
    );
}
