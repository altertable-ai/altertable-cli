import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const NPM_BUNDLE_OPTIONS = {
  target: "bun",
  minify: false,
  sourcemap: "none",
} as const;

const repositoryRoot = join(import.meta.dir, "../..");
const entrypoint = join(repositoryRoot, "cli/src/cli.ts");
export const NPM_BUNDLE_PATH = join(repositoryRoot, "cli/dist/cli.js");

export async function buildNpmBundle(outputPath = NPM_BUNDLE_PATH): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: dirname(outputPath),
    naming: basename(outputPath),
    ...NPM_BUNDLE_OPTIONS,
  });
  if (!result.success) {
    throw new Error(`npm bundle failed:\n${result.logs.map(String).join("\n")}`);
  }
  const output = Bun.file(outputPath);
  if (!(await output.exists()) || output.size === 0) {
    throw new Error(`npm bundle is missing or empty: ${outputPath}.`);
  }
  return outputPath;
}

if (import.meta.main) {
  console.log(`Built ${await buildNpmBundle()}.`);
}
