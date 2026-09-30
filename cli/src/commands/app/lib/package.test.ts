import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataAppPackage, requirePublishedDataApp } from "@/commands/app/lib/package.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "app-package-check-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function fixture(reference: string, lockedReference = reference, version = "0.59.0") {
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ dependencies: { [dataAppPackage]: reference } }),
  );
  await writeFile(
    join(directory, "bun.lock"),
    JSON.stringify({
      lockfileVersion: 2,
      workspaces: { "": { dependencies: { [dataAppPackage]: lockedReference } } },
      packages: { [dataAppPackage]: [`${dataAppPackage}@${version}`, "", {}, "integrity"] },
    }),
  );
}

test.each([
  ["file:.altertable/runtime", "app upgrade"],
  ["file:../local-runtime", "published"],
  ["github:altertable-ai/data-app", "published"],
])("check rejects %s before installing or modifying the lockfile", async (reference, message) => {
  await fixture(reference!);
  const before = await readFile(join(directory, "bun.lock"), "utf8");
  const failure = await requirePublishedDataApp(directory).catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message!) });
  expect(await readFile(join(directory, "bun.lock"), "utf8")).toBe(before);
});

test("check rejects a stale lockfile without resolving a replacement", async () => {
  await fixture("0.59.1", "0.59.0");
  const before = await readFile(join(directory, "bun.lock"), "utf8");
  const failure = await requirePublishedDataApp(directory).catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: expect.stringContaining("matching package.json") });
  expect(await readFile(join(directory, "bun.lock"), "utf8")).toBe(before);
});

test("check accepts an older registry package independent of the CLI starter pin", async () => {
  await fixture("^0.59.0");
  await requirePublishedDataApp(directory);
});
