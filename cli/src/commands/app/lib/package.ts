import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigurationError } from "@/lib/errors.ts";
import { isRecord } from "@/lib/object.ts";
import { dataAppPayload } from "@/commands/app/lib/payload.ts";

export const dataAppPackage = "@altertable/data-app";

type AppPackage = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export function recommendedDataAppVersion(): string {
  const version = JSON.parse(dataAppPayload.starter["package.json"]!).dependencies[dataAppPackage];
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    throw new ConfigurationError("The CLI starter must pin a published data app version.");
  }
  return version;
}

export async function readAppPackage(
  directory: string,
): Promise<{ source: string; manifest: AppPackage }> {
  try {
    const source = await readFile(join(directory, "package.json"), "utf8");
    const manifest: unknown = JSON.parse(source);
    if (
      !isRecord(manifest) ||
      !isRecord(manifest.dependencies) ||
      Object.values(manifest.dependencies).some((value) => typeof value !== "string")
    )
      throw new Error();
    return { source, manifest: manifest as AppPackage };
  } catch {
    throw new ConfigurationError(`Cannot read a valid package.json in ${directory}.`);
  }
}

export async function requirePublishedDataApp(directory: string): Promise<void> {
  const { manifest } = await readAppPackage(directory);
  const reference = manifest.dependencies?.[dataAppPackage];
  if (!reference || !/^[\d~^<>=*]/.test(reference)) {
    throw new ConfigurationError(
      `package.json needs a published ${dataAppPackage} version or range.`,
    );
  }
  let lock: string;
  try {
    lock = await readFile(join(directory, "bun.lock"), "utf8");
  } catch {
    throw new ConfigurationError(`Cannot read a valid bun.lock in ${directory}.`);
  }
  const { packages } = readAppLock(lock, directory, reference);
  const version = lockedVersion(packages, dataAppPackage);
  if (!version || !Bun.semver.satisfies(version, reference)) {
    throw new ConfigurationError(
      "bun.lock does not resolve the declared data app package. Run bun install before checking.",
    );
  }
}

export function readAppLock(
  source: string,
  directory: string,
  reference?: string,
): {
  packages: Record<string, unknown>;
} {
  try {
    const value = parseJsonc(source);
    const workspaces = isRecord(value) && value.workspaces;
    const root = isRecord(workspaces) && workspaces[""];
    const dependencies = isRecord(root) && root.dependencies;
    if (
      !isRecord(value) ||
      !isRecord(value.packages) ||
      !isRecord(dependencies) ||
      (reference !== undefined && dependencies[dataAppPackage] !== reference)
    )
      throw new Error();
    return { packages: value.packages };
  } catch {
    throw new ConfigurationError(
      `Cannot read a valid bun.lock matching package.json in ${directory}.`,
    );
  }
}

export function lockedVersion(packages: Record<string, unknown>, name: string): string | undefined {
  const entry = packages[name];
  if (!Array.isArray(entry) || typeof entry[0] !== "string") return;
  const version = entry[0].slice(`${name}@`.length);
  return entry[0].startsWith(`${name}@`) && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)
    ? version
    : undefined;
}

export function recommendedDataAppPeers(): Record<string, string> {
  const { packages } = readAppLock(
    dataAppPayload.starter["bun.lock"]!,
    "CLI starter",
    recommendedDataAppVersion(),
  );
  const entry = packages[dataAppPackage];
  const metadata =
    Array.isArray(entry) &&
    entry.find((value) => isRecord(value) && isRecord(value.peerDependencies));
  if (
    !isRecord(metadata) ||
    !isRecord(metadata.peerDependencies) ||
    Object.values(metadata.peerDependencies).some((value) => typeof value !== "string")
  ) {
    throw new ConfigurationError("The CLI starter lockfile needs data app peer dependencies.");
  }
  return metadata.peerDependencies as Record<string, string>;
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
