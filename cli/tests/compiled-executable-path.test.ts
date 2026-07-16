import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const cliRoot = resolve(import.meta.dir, "..");
const fixture = join(import.meta.dir, "fixtures", "compiled-executable-path.ts");
let testDirectory = "";
let executable = "";
let invocationDirectory = "";

beforeAll(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "altertable-compiled-path-test-"));
  const releaseDirectory = join(testDirectory, "release");
  const binDirectory = join(testDirectory, "bin");
  invocationDirectory = join(testDirectory, "work");
  executable = join(releaseDirectory, "altertable");
  mkdirSync(releaseDirectory, { recursive: true });
  mkdirSync(binDirectory, { recursive: true });
  mkdirSync(invocationDirectory, { recursive: true });

  const build = Bun.spawnSync(
    [process.execPath, "build", "--compile", fixture, "--outfile", executable],
    { cwd: cliRoot, stdout: "pipe", stderr: "pipe" },
  );
  if (build.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(build.stderr));
  }
  symlinkSync(executable, join(binDirectory, "altertable"));
});

afterAll(() => {
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("compiled executable path", () => {
  test("resolves the canonical release binary when invoked through PATH and a symlink", () => {
    const result = Bun.spawnSync(["altertable"], {
      cwd: invocationDirectory,
      env: {
        ...process.env,
        PATH: `${join(testDirectory, "bin")}:${process.env.PATH ?? ""}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toBe("");
    expect(new TextDecoder().decode(result.stdout).trim()).toBe(realpathSync(executable));
    expect(dirname(realpathSync(executable))).not.toBe(invocationDirectory);
  });
});
