import { afterEach, beforeEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dataAppPackage,
  dataAppPackages,
  recommendedDataAppPeers,
  requirePublishedDataApp,
} from "@/commands/app/lib/package.ts";

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
  ["file:.altertable/runtime", "published"],
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

for (const name of dataAppPackages.slice(1)) {
  test(`check validates declared ${name} independently of core`, async () => {
    await fixture("0.71.0", "0.71.0", "0.71.0");
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    manifest.devDependencies = { [name]: "0.71.0" };
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    const lock = JSON.parse(await readFile(join(directory, "bun.lock"), "utf8"));
    lock.workspaces[""].devDependencies = { [name]: "0.71.0" };
    lock.packages[name] = [`${name}@0.71.0`, "", {}, "integrity"];
    await writeFile(join(directory, "bun.lock"), JSON.stringify(lock));
    await requirePublishedDataApp(directory);
    lock.workspaces[""].devDependencies[name] = "0.70.0";
    await writeFile(join(directory, "bun.lock"), JSON.stringify(lock));
    await rejects(requirePublishedDataApp(directory), /matching package.json/);
    lock.workspaces[""].devDependencies[name] = "0.71.0";
    lock.packages[name][0] = `${name}@0.70.0`;
    await writeFile(join(directory, "bun.lock"), JSON.stringify(lock));
    await rejects(requirePublishedDataApp(directory), {
      message: `bun.lock does not resolve the declared ${name} package. Run bun install before checking.`,
    });
    manifest.devDependencies[name] = "^0.70.0";
    lock.workspaces[""].devDependencies[name] = "^0.70.0";
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    await writeFile(join(directory, "bun.lock"), JSON.stringify(lock));
    await rejects(requirePublishedDataApp(directory), /same version/);
    manifest.devDependencies[name] = "file:../runtime";
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    await rejects(requirePublishedDataApp(directory), {
      message: `package.json needs a published ${name} version or range.`,
    });
  });
}

test("React peers belong to the authoring package while core has none", () => {
  expect(recommendedDataAppPeers([dataAppPackage])).toEqual({});
  expect(recommendedDataAppPeers(["@altertable/data-app-react"])).toEqual({
    react: ">=19.2.0",
    "react-dom": ">=19.2.0",
  });
});
