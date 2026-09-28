import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../src/commands/app/templates");
const formatter = resolve(import.meta.dir, "../node_modules/.bin/oxfmt");
const check = process.argv.includes("--check");
const unformatted: string[] = [];

async function visit(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    // app.json has bare interpolation tokens; oxfmt does not support SVG or gitignore input.
    if (
      !entry.name.endsWith(".txt") ||
      ["gitignore.txt", "app.json.txt", "favicon.svg.txt"].includes(entry.name)
    )
      continue;
    const source = await readFile(path, "utf8");
    const result = Bun.spawnSync([formatter, "--stdin-filepath", entry.name.slice(0, -4)], {
      stdin: Bun.file(path),
    });
    if (result.exitCode !== 0) {
      throw new Error(`${relative(root, path)}: ${result.stderr.toString()}`);
    }
    const formatted = result.stdout.toString();
    if (source === formatted) continue;
    if (check) unformatted.push(relative(root, path));
    else await writeFile(path, formatted);
  }
}

await visit(root);
if (unformatted.length) {
  console.error(`Unformatted app templates:\n${unformatted.join("\n")}`);
  process.exitCode = 1;
}
