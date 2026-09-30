import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAppFiles, readDataAppPayload } from "@/commands/app/lib/distribution.ts";
import {
  dataAppPackage,
  readAppLock,
  recommendedDataAppVersion,
} from "@/commands/app/lib/package.ts";
import { upgradeApp } from "@/commands/app/upgrade.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "package-upgrade-"));
  directories.push(directory);
  const files = createAppFiles(await readDataAppPayload(), {
    name: "upgrade-test",
    title: "Test",
    scope: { organization: "Test", environment: "test" },
  });
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), content);
  }
  return directory;
}

async function snapshot(directory: string) {
  return Promise.all(
    ["package.json", "bun.lock", "src/App.tsx"].map((name) =>
      readFile(join(directory, name), "utf8"),
    ),
  );
}

async function expectUpgradeFailure(operation: () => Promise<boolean>, message: string) {
  const failure = await operation().catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}

async function updateManifest(
  directory: string,
  edit: (pkg: { dependencies: Record<string, string>; scripts: Record<string, string> }) => void,
) {
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  edit(pkg);
  await writeFile(join(directory, "package.json"), JSON.stringify(pkg));
  const { packages } = readAppLock(await readFile(join(directory, "bun.lock"), "utf8"), directory);
  await writeFile(
    join(directory, "bun.lock"),
    JSON.stringify({
      lockfileVersion: 2,
      configVersion: 1,
      workspaces: { "": { dependencies: pkg.dependencies } },
      packages,
    }),
  );
}

async function resolveLock(directory: string) {
  const payload = await readDataAppPayload();
  await writeFile(join(directory, "bun.lock"), payload.starter["bun.lock"]!);
}

test("an exact current pin is a no-op", async () => {
  const directory = await fixture();
  const before = await snapshot(directory);
  expect(await upgradeApp(directory)).toBe(false);
  expect(await snapshot(directory)).toEqual(before);
});

test("failed resolution restores the manifest and lockfile", async () => {
  const directory = await fixture();
  await updateManifest(directory, (pkg) => {
    pkg.dependencies[dataAppPackage] = "^0.59.1";
  });
  const before = await snapshot(directory);
  await expectUpgradeFailure(
    () =>
      upgradeApp(directory, {
        async resolveLock(path) {
          await writeFile(join(path, "bun.lock"), "partial lock");
          throw new Error("resolution failed");
        },
      }),
    "resolution failed",
  );
  expect(await snapshot(directory)).toEqual(before);
});

test("a stale resolved lockfile restores the manifest and lockfile", async () => {
  const directory = await fixture();
  await updateManifest(directory, (pkg) => {
    pkg.dependencies[dataAppPackage] = "^0.59.1";
  });
  const before = await snapshot(directory);
  await expectUpgradeFailure(
    () => upgradeApp(directory, { resolveLock: async () => {} }),
    "matching package.json",
  );
  expect(await snapshot(directory)).toEqual(before);
});

test("incompatible peers fail before mutation", async () => {
  const directory = await fixture();
  await updateManifest(directory, (pkg) => {
    pkg.dependencies.react = "^18.0.0";
  });
  const before = await snapshot(directory);
  await expectUpgradeFailure(() => upgradeApp(directory), "Data app package needs react@");
  expect(await snapshot(directory)).toEqual(before);
});

test("missing peers use starter defaults while preserving custom scripts", async () => {
  const directory = await fixture();
  await updateManifest(directory, (pkg) => {
    delete pkg.dependencies["react-dom"];
    pkg.scripts.custom = "echo user-owned";
  });
  await upgradeApp(directory, { resolveLock });
  expect(JSON.parse(await readFile(join(directory, "package.json"), "utf8"))).toMatchObject({
    dependencies: { "react-dom": "19.3.0" },
    scripts: { custom: "echo user-owned" },
  });
});

test("registry upgrades pin a compatible range and preserve unrelated dependencies and app files", async () => {
  const directory = await fixture();
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  pkg.dependencies[dataAppPackage] = "^0.59.1";
  pkg.dependencies.yaml = "2.9.0";
  pkg.scripts.custom = "echo user-owned";
  await writeFile(join(directory, "package.json"), JSON.stringify(pkg));
  const { packages } = readAppLock(await readFile(join(directory, "bun.lock"), "utf8"), directory);

  await writeFile(
    join(directory, "bun.lock"),
    JSON.stringify({
      lockfileVersion: 2,
      configVersion: 1,
      workspaces: { "": { dependencies: pkg.dependencies } },
      packages,
    }),
  );
  const original = await readFile(join(directory, "src/App.tsx"), "utf8");
  await upgradeApp(directory);
  expect(JSON.parse(await readFile(join(directory, "package.json"), "utf8"))).toMatchObject({
    dependencies: { yaml: "2.9.0", [dataAppPackage]: recommendedDataAppVersion() },
    scripts: { custom: "echo user-owned" },
  });
  expect(await readFile(join(directory, "src/App.tsx"), "utf8")).toBe(original);
}, 60_000);

test("a newer installed package is never downgraded", async () => {
  const directory = await fixture();
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  pkg.dependencies[dataAppPackage] = "9.0.0";
  await writeFile(join(directory, "package.json"), JSON.stringify(pkg));
  const { packages } = readAppLock(await readFile(join(directory, "bun.lock"), "utf8"), directory);
  packages[dataAppPackage] = [`${dataAppPackage}@9.0.0`, "", {}, "integrity"];
  await writeFile(
    join(directory, "bun.lock"),
    JSON.stringify({
      lockfileVersion: 2,
      configVersion: 1,
      workspaces: { "": { dependencies: pkg.dependencies } },
      packages,
    }),
  );
  const before = await snapshot(directory);
  expect(await upgradeApp(directory)).toBe(false);
  expect(await snapshot(directory)).toEqual(before);
});
