import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigurationError } from "@/lib/errors.ts";
import { dataAppPayload } from "@/commands/app/lib/payload.ts";
import { runtimeIntegrity, runtimePath } from "@/commands/app/lib/distribution.ts";

export {
  runtimePath,
  runtimeSourceDirectory,
  readRuntimeSource,
} from "@/commands/app/lib/distribution.ts";
export const runtimeFiles = dataAppPayload.runtime;

type RuntimeIntegrity = { version: string; sha256: Record<string, string> };
export type InstalledRuntime = RuntimeIntegrity;
function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function currentRuntimeIntegrity(
  files: Record<string, string> = runtimeFiles,
): RuntimeIntegrity {
  return runtimeIntegrity(files);
}

export async function installedRuntimeIntegrity(directory: string): Promise<InstalledRuntime> {
  const path = runtimePath;
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
    typeof integrity.version !== "string" ||
    !integrity.sha256 ||
    typeof integrity.sha256 !== "object" ||
    !Object.keys(integrity.sha256).length
  ) {
    throw new ConfigurationError("Data app runtime has an invalid integrity record.");
  }
  for (const [name, checksum] of Object.entries(integrity.sha256)) {
    if (name.split("/").some((part) => !part || part === "." || part === "..")) {
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
  return integrity;
}
