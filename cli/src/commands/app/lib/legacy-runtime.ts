import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigurationError } from "@/lib/errors.ts";
import { legacyRuntimePath } from "@/commands/app/lib/package.ts";
import { isRecord } from "@/lib/object.ts";

type RuntimeIntegrity = { version: string; sha256: Record<string, string> };
type InstalledRuntime = RuntimeIntegrity;
function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function validateLegacyRuntime(directory: string): Promise<InstalledRuntime> {
  const path = legacyRuntimePath;
  let integrity: RuntimeIntegrity;
  try {
    integrity = JSON.parse(
      await readFile(join(directory, path, "integrity.json"), "utf8"),
    ) as RuntimeIntegrity;
  } catch {
    throw new ConfigurationError(
      "Data app runtime has no integrity record. Restore it from the original generated project.",
    );
  }
  if (
    !isRecord(integrity) ||
    typeof integrity.version !== "string" ||
    !integrity.sha256 ||
    !isRecord(integrity.sha256) ||
    !Object.keys(integrity.sha256).length
  ) {
    throw new ConfigurationError("Data app runtime has an invalid integrity record.");
  }
  for (const [name, checksum] of Object.entries(integrity.sha256)) {
    if (
      name.includes("\\") ||
      name.split("/").some((part) => !part || part === "." || part === "..") ||
      typeof checksum !== "string" ||
      !/^[a-f0-9]{64}$/.test(checksum)
    ) {
      throw new ConfigurationError("Data app runtime has an invalid integrity record.");
    }
    let content: string;
    try {
      content = await readFile(join(directory, path, name), "utf8");
    } catch {
      throw new ConfigurationError(`Data app runtime is missing ${name}.`);
    }
    if (hash(content) !== checksum) {
      throw new ConfigurationError(
        `Data app runtime ${name} was modified. Keep app code outside ${path}/.`,
      );
    }
  }
  async function visit(relative: string): Promise<void> {
    const target = join(directory, path, relative);
    const stat = await lstat(target);
    if (stat.isSymbolicLink())
      throw new ConfigurationError(
        `Data app runtime ${relative || path} is a symlink. Restore the managed runtime before upgrading.`,
      );
    if (stat.isDirectory()) {
      for (const name of await readdir(target))
        await visit(relative ? `${relative}/${name}` : name);
    } else if (
      !stat.isFile() ||
      (relative !== "integrity.json" && !Object.hasOwn(integrity.sha256, relative))
    ) {
      throw new ConfigurationError(
        `Data app runtime contains unmanaged file ${relative}. Move custom files outside ${path}/ before upgrading.`,
      );
    }
  }
  await visit("");
  return integrity;
}
