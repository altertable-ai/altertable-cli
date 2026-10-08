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
  ".oxlintrc.json",
  ".oxfmtrc.json",
] as const;
export const dataAppDirectory = fileURLToPath(new URL("../../../../../data-app/", import.meta.url));
export type DataAppPayload = { starter: Record<string, string> };

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

/** Release builds embed only the starter; its runtime is installed from npm. */
export async function readDataAppPayload(directory = dataAppDirectory): Promise<DataAppPayload> {
  return { starter: await readFiles(join(directory, "starter"), starterFiles) };
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
  return files;
}
