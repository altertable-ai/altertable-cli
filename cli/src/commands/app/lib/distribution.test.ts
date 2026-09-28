import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAppFiles,
  dataAppDirectory,
  readDataAppPayload,
  readRuntimeSource,
} from "@/commands/app/lib/distribution.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("distribution is deterministic, source-based, and excludes development files", async () => {
  const payload = await readDataAppPayload();
  expect(await readDataAppPayload()).toEqual(payload);
  expect(Object.keys(payload.runtime)).toContain("src/ui/PlayStory.tsx");
  expect(Object.keys(payload.starter)).toContain("src/App.tsx");
  for (const path of [...Object.keys(payload.runtime), ...Object.keys(payload.starter)]) {
    expect(path).not.toMatch(/(^|\/)(tests|fixtures|node_modules|dist|\.altertable)(\/|$)|\.txt$/);
  }
  const identity = {
    name: "example",
    title: 'A "quoted" title',
    scope: { organization: "<script>& {{APP_TITLE}}", environment: "test\nteam" },
  };
  const files = createAppFiles(payload, identity);
  expect(JSON.parse(files["app.json"]!)).toMatchObject({
    title: identity.title,
    scope: identity.scope,
  });
  expect(files["src/App.tsx"]).toBe(payload.starter["src/App.tsx"]);
  expect(files["src/server.ts"]).toBe(payload.starter["src/server.ts"]);
  expect(files["bun.lock"]).toContain('"name": "example"');
});

test("new runtime source files enter the payload without a manual inventory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "runtime-distribution-"));
  directories.push(directory);
  await cp(join(dataAppDirectory, "runtime", "src"), join(directory, "src"), { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ files: ["package.json", "src"] }),
  );
  await writeFile(join(directory, "src/new.ts"), "export const added = true;\n");
  expect((await readRuntimeSource(directory))["src/new.ts"]).toContain("added");
  await writeFile(join(directory, "src/new.test.ts"), "test artifact");
  expect(readRuntimeSource(directory)).rejects.toThrow("Development artifact");
});

test("distribution rejects paths outside its source and symlinks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "runtime-distribution-"));
  directories.push(directory);
  await writeFile(join(directory, "package.json"), JSON.stringify({ files: ["../secret"] }));
  expect(readRuntimeSource(directory)).rejects.toThrow("Invalid distribution path");
  await mkdir(join(directory, "src"));
  await writeFile(join(directory, "package.json"), JSON.stringify({ files: ["src"] }));
  await symlink(join(directory, "package.json"), join(directory, "src/link.ts"));
  expect(readRuntimeSource(directory)).rejects.toThrow("Symlink");
});
