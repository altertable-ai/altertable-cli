import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BunPlugin } from "bun";
import { upgradeApp } from "@/commands/app/upgrade.ts";
import {
  dataAppDirectory,
  readDataAppPayload,
  runtimeIntegrity,
  runtimePath,
} from "@/commands/app/lib/distribution.ts";

/** Both npm and native releases embed the same deterministic source payload. */
export function dataAppPlugin(): BunPlugin {
  return {
    name: "data-app-payload",
    setup(build) {
      build.onLoad({ filter: /[/\\]commands[/\\]app[/\\]lib[/\\]payload\.ts$/ }, async () => ({
        contents: `export const dataAppPayload = ${JSON.stringify(await readDataAppPayload())};`,
        loader: "js",
      }));
    },
  };
}

export async function setupDataApp(): Promise<void> {
  const payload = await readDataAppPayload();
  const directory = join(dataAppDirectory, "starter", runtimePath);
  if (await Bun.file(join(directory, "integrity.json")).exists()) {
    await upgradeApp(join(dataAppDirectory, "starter"), { runtimeFiles: payload.runtime });
    return;
  }
  for (const [name, content] of Object.entries(payload.runtime)) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), content);
  }
  await writeFile(
    join(directory, "integrity.json"),
    `${JSON.stringify(runtimeIntegrity(payload.runtime), null, 2)}\n`,
  );
}

if (import.meta.main) {
  if (!Bun.argv.includes("--setup"))
    throw new Error("Usage: bun run scripts/package-data-app.ts --setup");
  await setupDataApp();
}
