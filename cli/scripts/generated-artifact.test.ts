import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseGeneratedArtifactMode,
  updateOrCheckGeneratedArtifact,
} from "@/../scripts/generated-artifact.ts";

const testDirectories: string[] = [];

function createTestArtifactPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "altertable-generated-artifact-"));
  testDirectories.push(directory);
  return join(directory, "artifact.txt");
}

afterEach(() => {
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generated artifact synchronization", () => {
  test("selects check mode explicitly", () => {
    expect(parseGeneratedArtifactMode([])).toBe("write");
    expect(parseGeneratedArtifactMode(["--check"])).toBe("check");
  });

  test("writes generated content", () => {
    const outputPath = createTestArtifactPath();

    updateOrCheckGeneratedArtifact({ outputPath, content: "generated\n", mode: "write" });

    expect(readFileSync(outputPath, "utf8")).toBe("generated\n");
  });

  test("checks current content without writing", () => {
    const outputPath = createTestArtifactPath();
    writeFileSync(outputPath, "generated\n");

    updateOrCheckGeneratedArtifact({ outputPath, content: "generated\n", mode: "check" });

    expect(readFileSync(outputPath, "utf8")).toBe("generated\n");
  });

  test("reports stale and missing output with regeneration guidance", () => {
    const stalePath = createTestArtifactPath();
    writeFileSync(stalePath, "old\n");

    expect(() =>
      updateOrCheckGeneratedArtifact({
        outputPath: stalePath,
        content: "new\n",
        mode: "check",
        generateCommand: "bun run generate:commands",
      }),
    ).toThrow("Run: bun run generate:commands");

    expect(() =>
      updateOrCheckGeneratedArtifact({
        outputPath: createTestArtifactPath(),
        content: "new\n",
        mode: "check",
      }),
    ).toThrow("Generated artifact is stale");
  });
});
