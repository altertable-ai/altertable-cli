import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineCommand } from "@/lib/command.ts";
import { ConfigurationError } from "@/lib/errors.ts";
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
    const upgraded = await upgradeApp(appDirectory(args.dir));
    sink.writeHuman(
      upgraded
        ? `Updated data app runtime to ${currentRuntimeIntegrity().version}. Run altertable app check, then restart any running app dev server.`
        : `Data app runtime ${currentRuntimeIntegrity().version} is already current.`,
    );
  },
});

type UpgradeOptions = {
  afterApply?: (path: string) => void | Promise<void>;
  runtimeFiles?: Record<string, string>;
};
type Applied = { destination: string; backup: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

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

function readLock(lock: string, directory: string): void {
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
}

/** Upgrade from validated inputs. Staged replacements are swapped into place and rolled back on failure. */
export async function upgradeApp(
  directory: string,
  options: UpgradeOptions = {},
): Promise<boolean> {
  const files: Record<string, string> = options.runtimeFiles ?? runtimeFiles;
  const installed = await installedRuntimeIntegrity(directory);
  const current = currentRuntimeIntegrity(files);
  if (
    installed.version === current.version &&
    Object.entries(current.sha256).every(([name, checksum]) => installed.sha256[name] === checksum)
  )
    return false;

  const lockPath = join(directory, "bun.lock");
  let lock: string;
  try {
    lock = await readFile(lockPath, "utf8");
  } catch {
    throw new ConfigurationError(`Cannot read a valid bun.lock in ${directory}.`);
  }
  readLock(lock, directory);
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
    {
      const backup = join(transaction, "backup", "runtime");
      const hadOriginal = await exists(target);
      if (hadOriginal) {
        await mkdir(dirname(backup), { recursive: true });
        await rename(target, backup);
      }
      applied.push({ destination: target, backup: hadOriginal ? backup : null });
      await rename(stagedRuntime, target);
      await options.afterApply?.(target);
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
