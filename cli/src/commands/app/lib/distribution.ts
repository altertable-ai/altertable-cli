import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The only repository-to-project copy boundary. Entries are files or whole directories. */
export const starterFiles = [
  "src",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.json",
  "app.json",
  "README.md",
  "AGENTS.md",
  ".gitignore",
  ".oxfmtrc.json",
] as const;
export const runtimePath = ".altertable/runtime";
export const dataAppDirectory = fileURLToPath(new URL("../../../../../data-app/", import.meta.url));
export const runtimeSourceDirectory = join(dataAppDirectory, "runtime");
export type DataAppPayload = { starter: Record<string, string>; runtime: Record<string, string> };

function assertRelativePath(path: string): void {
  if (
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid distribution path: ${path}`);
  }
}

/** Expand explicit package entries, rejecting symlinks and test/build artifacts. */
async function readFiles(
  directory: string,
  entries: readonly string[],
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(name: string): Promise<void> {
    assertRelativePath(name);
    if (/(^|\/)(node_modules|tests?|fixtures|dist)(\/|$)|\.(test|spec)\./.test(name)) {
      throw new Error(`Development artifact in distribution: ${name}`);
    }
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Symlink in distribution: ${name}`);
    if (info.isDirectory()) {
      for (const child of (await readdir(path)).sort()) await visit(`${name}/${child}`);
    } else if (info.isFile()) {
      files[name] = await readFile(path, "utf8");
    } else throw new Error(`Unsupported distribution file: ${name}`);
  }
  for (const entry of [...entries].sort()) await visit(entry);
  return files;
}

export async function readRuntimeSource(
  directory = runtimeSourceDirectory,
): Promise<Record<string, string>> {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
    files?: unknown;
  };
  if (!Array.isArray(manifest.files) || !manifest.files.every((file) => typeof file === "string")) {
    throw new Error("Runtime package.json needs a files allowlist.");
  }
  return readFiles(directory, manifest.files);
}

export async function readDataAppPayload(directory = dataAppDirectory): Promise<DataAppPayload> {
  const [starter, runtime] = await Promise.all([
    readFiles(join(directory, "starter"), starterFiles),
    readRuntimeSource(join(directory, "runtime")),
  ]);
  return { starter, runtime };
}

export function runtimeIntegrity(files: Record<string, string>): {
  version: string;
  sha256: Record<string, string>;
} {
  return {
    version: (JSON.parse(files["package.json"]!) as { version: string }).version,
    sha256: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [
        name,
        createHash("sha256").update(content).digest("hex"),
      ]),
    ),
  };
}

export function createAppFiles(
  payload: DataAppPayload,
  identity: {
    name: string;
    title: string;
    scope: { organization: string; environment: string };
  },
): Record<string, string> {
  const files = { ...payload.starter };
  const packageJson = JSON.parse(files["package.json"]!);
  packageJson.name = identity.name;
  packageJson.dependencies["@altertable/data-app-runtime"] = `file:${runtimePath}`;
  files["package.json"] = `${JSON.stringify(packageJson, null, 2)}\n`;
  const app = JSON.parse(files["app.json"]!);
  app.title = identity.title;
  app.scope = identity.scope;
  files["app.json"] = `${JSON.stringify(app, null, 2)}\n`;
  // Bun's text lock is JSONC. Only its root workspace name changes during scaffolding.
  const oldName = JSON.stringify(JSON.parse(payload.starter["package.json"]!).name);
  files["bun.lock"] = files["bun.lock"]!.replace(
    `"name": ${oldName}`,
    `"name": ${JSON.stringify(identity.name)}`,
  );
  for (const [name, content] of Object.entries(payload.runtime))
    files[`${runtimePath}/${name}`] = content;
  files[`${runtimePath}/integrity.json`] =
    `${JSON.stringify(runtimeIntegrity(payload.runtime), null, 2)}\n`;
  return files;
}
