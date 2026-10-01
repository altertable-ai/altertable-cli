import type { BunPlugin } from "bun";
import { readDataAppPayload } from "@/commands/app/lib/distribution.ts";

/** Both npm and native releases embed the same deterministic starter template. */
export function dataAppPlugin(): BunPlugin {
  return {
    name: "data-app-starter",
    setup(build) {
      build.onLoad({ filter: /[/\\]commands[/\\]app[/\\]lib[/\\]payload\.ts$/ }, async () => ({
        contents: `export const dataAppPayload = ${JSON.stringify(await readDataAppPayload())};`,
        loader: "js",
      }));
    },
  };
}
