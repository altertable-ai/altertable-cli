import { readFileSync, writeFileSync } from "node:fs";

export type GeneratedArtifactMode = "write" | "check";

type SyncGeneratedArtifactOptions = {
  outputPath: string;
  content: string;
  mode: GeneratedArtifactMode;
  generateCommand?: string;
};

export function generatedArtifactMode(argv: readonly string[]): GeneratedArtifactMode {
  return argv.includes("--check") ? "check" : "write";
}

export function syncGeneratedArtifact({
  outputPath,
  content,
  mode,
  generateCommand = "bun run generate",
}: SyncGeneratedArtifactOptions): void {
  if (mode === "write") {
    writeFileSync(outputPath, content);
    return;
  }

  let current: string | undefined;
  try {
    current = readFileSync(outputPath, "utf8");
  } catch {
    // Missing output is reported as stale with the same remediation.
  }
  if (current !== content) {
    throw new Error(`Generated artifact is stale: ${outputPath}\nRun: ${generateCommand}`);
  }
}
