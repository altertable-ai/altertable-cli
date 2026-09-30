import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAppFiles, readDataAppPayload } from "@/commands/app/lib/distribution.ts";
import {
  dataAppPackage,
  legacyRuntimePath,
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

async function fixture(legacy = true) {
  const directory = await mkdtemp(join(tmpdir(), "package-upgrade-"));
  directories.push(directory);
  const payload = await readDataAppPayload();
  const files = createAppFiles(payload, {
    name: "upgrade-test",
    title: "Test",
    scope: { organization: "Test", environment: "test" },
  });
  if (legacy) {
    const pkg = JSON.parse(files["package.json"]!);
    pkg.dependencies[dataAppPackage] = `file:${legacyRuntimePath}`;
    pkg.scripts.custom = "echo user-owned";
    files["package.json"] = JSON.stringify(pkg);
    const lock = readAppLock(files["bun.lock"]!, directory);
    files["bun.lock"] = JSON.stringify({
      lockfileVersion: 2,
      configVersion: 1,
      workspaces: { "": { dependencies: pkg.dependencies } },
      packages: {
        ...lock.packages,
        [dataAppPackage]: [`${dataAppPackage}@file:${legacyRuntimePath}`, {}],
      },
    });
    files["src/server.ts"] = files["src/server.ts"]!.replace("/server/bun", "/server");
    files["src/main.tsx"] = files["src/main.tsx"]!.replace(
      'import "@altertable/data-app/react/styles.css";\n',
      "",
    );
    files["AGENTS.md"] = "[Runtime map](.altertable/runtime/README.md#find-ui-by-task)\n";
    files["docs/data.md"] =
      "[Named queries](../.altertable/runtime/README.md#execute-named-queries)\n";
    const runtime = {
      "package.json": JSON.stringify({ name: dataAppPackage, version: "0.57.0" }),
      "src/server.ts": "export const oldRuntime = true;\n",
    };
    for (const [name, content] of Object.entries(runtime))
      files[`${legacyRuntimePath}/${name}`] = content;
    files[`${legacyRuntimePath}/integrity.json`] = JSON.stringify({
      version: "0.57.0",
      sha256: Object.fromEntries(
        Object.entries(runtime).map(([name, content]) => [
          name,
          createHash("sha256").update(content).digest("hex"),
        ]),
      ),
    });
  }
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), content);
  }
  return directory;
}

const tracked = [
  "package.json",
  "bun.lock",
  "src/server.ts",
  "src/main.tsx",
  "src/operations.ts",
  "AGENTS.md",
  "docs/data.md",
  `${legacyRuntimePath}/integrity.json`,
  `${legacyRuntimePath}/src/server.ts`,
];
async function snapshot(directory: string) {
  return Promise.all(
    tracked.map(async (name) => [
      name,
      await readFile(join(directory, name), "utf8").catch(() => null),
    ]),
  );
}
const validateMigration = async () => {};
async function expectUpgradeFailure(operation: () => Promise<boolean>, message: string) {
  const failure = await operation().catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}

async function resolveLock(directory: string) {
  const payload = await readDataAppPayload();
  await writeFile(join(directory, "bun.lock"), payload.starter["bun.lock"]!);
}

test("legacy migration installs the published artifact with a frozen lock and preserves app logic", async () => {
  const directory = await fixture();
  const original = await readFile(join(directory, "src/operations.ts"), "utf8");
  expect(await upgradeApp(directory)).toBe(true);
  expect(await Bun.file(join(directory, legacyRuntimePath, "package.json")).exists()).toBe(false);
  expect(await readFile(join(directory, "src/operations.ts"), "utf8")).toBe(original);
  expect(await readFile(join(directory, "src/server.ts"), "utf8")).toContain("/server/bun");
  expect(await readFile(join(directory, "src/main.tsx"), "utf8")).toContain("/react/styles.css");
  expect(await readFile(join(directory, "AGENTS.md"), "utf8")).toContain(
    "node_modules/@altertable/data-app/docs/react.md",
  );
  expect(await readFile(join(directory, "docs/data.md"), "utf8")).toContain(
    "../node_modules/@altertable/data-app/docs/contract.md",
  );
  expect(JSON.parse(await readFile(join(directory, "package.json"), "utf8"))).toMatchObject({
    dependencies: { [dataAppPackage]: recommendedDataAppVersion() },
    scripts: { custom: "echo user-owned" },
  });
  const child = Bun.spawn([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: directory,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
  expect(await upgradeApp(directory)).toBe(false);
}, 60_000);

test("failed resolution restores all migration edits and leaves the legacy runtime intact", async () => {
  const directory = await fixture();
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

test("failure after runtime removal restores the runtime, manifest, lock and sources", async () => {
  const directory = await fixture();
  const before = await snapshot(directory);
  await expectUpgradeFailure(
    () =>
      upgradeApp(directory, {
        resolveLock,
        validateMigration,
        afterApply(path) {
          if (path === join(directory, legacyRuntimePath)) throw new Error("write failure");
        },
      }),
    "write failure",
  );
  expect(await snapshot(directory)).toEqual(before);
});

test.each(["modified", "added", "symlink"])(
  "legacy migration refuses %s runtime files before mutation",
  async (kind) => {
    const directory = await fixture();
    const runtime = join(directory, legacyRuntimePath);
    if (kind === "modified") await writeFile(join(runtime, "src/server.ts"), "custom runtime");
    else if (kind === "added") await writeFile(join(runtime, "custom.ts"), "custom runtime");
    else await symlink(join(directory, "package.json"), join(runtime, "custom.ts"));
    const before = await snapshot(directory);
    await expectUpgradeFailure(
      () => upgradeApp(directory, { resolveLock, validateMigration }),
      kind === "modified" ? "was modified" : kind === "added" ? "unmanaged file" : "symlink",
    );
    expect(await snapshot(directory)).toEqual(before);
  },
);

test("mixed and aliased server imports migrate without changing portable handler imports", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "src/server.ts"),
    'import { createDataHandler, serveLocalApp as serve, localLakehouse } from "@altertable/data-app/server"; // Portable handler and local adapter\nconsole.log(createDataHandler, serve, localLakehouse);\n',
  );
  await upgradeApp(directory, { resolveLock, validateMigration });
  const source = await readFile(join(directory, "src/server.ts"), "utf8");
  expect(source).toContain('import { createDataHandler } from "@altertable/data-app/server"');
  expect(source).toContain(
    'import { serveLocalApp as serve, localLakehouse } from "@altertable/data-app/server/bun"',
  );
  expect(source).toContain("// Portable handler and local adapter\nimport { createDataHandler }");
  expect(source).toContain("console.log(createDataHandler, serve, localLakehouse)");
});

test("unsupported namespace imports stop before any writes", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "src/server.ts"),
    'import * as server from "@altertable/data-app/server";\nserver.serveLocalApp({});\n',
  );
  const before = await snapshot(directory);
  await expectUpgradeFailure(
    () => upgradeApp(directory, { resolveLock, validateMigration }),
    "Cannot safely migrate server imports",
  );
  expect(await snapshot(directory)).toEqual(before);
});

test("incompatible peers and invalid locks fail before mutation", async () => {
  const directory = await fixture();
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  pkg.dependencies.react = "^18.0.0";
  await writeFile(join(directory, "package.json"), JSON.stringify(pkg));
  const before = await snapshot(directory);
  await expectUpgradeFailure(
    () => upgradeApp(directory, { resolveLock, validateMigration }),
    "Data app package needs react@",
  );
  expect(await snapshot(directory)).toEqual(before);
  await writeFile(join(directory, "bun.lock"), "invalid");
  const invalid = await snapshot(directory);
  await expectUpgradeFailure(
    () => upgradeApp(directory, { resolveLock, validateMigration }),
    "valid bun.lock",
  );
  expect(await snapshot(directory)).toEqual(invalid);
});

test("missing peers use starter defaults while preserving custom scripts", async () => {
  const directory = await fixture();
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  delete pkg.dependencies["react-dom"];
  await writeFile(join(directory, "package.json"), JSON.stringify(pkg));
  await upgradeApp(directory, { resolveLock, validateMigration });
  expect(JSON.parse(await readFile(join(directory, "package.json"), "utf8"))).toMatchObject({
    dependencies: { "react-dom": "19.3.0" },
    scripts: { custom: "echo user-owned" },
  });
});

test("registry upgrades pin a compatible range and preserve unrelated dependencies and app files", async () => {
  const directory = await fixture(false);
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
  const directory = await fixture(false);
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

test.each([
  'import { StorySection } from "@altertable/data-app/react";',
  'import { PlayStory as Present } from "@altertable/data-app/react";',
  "export const view = <DataApp story={{ steps: [] }} />;",
  "export const step = context.storyStep({});",
])("legacy story APIs receive migration guidance before mutation: %s", async (source) => {
  const directory = await fixture();
  await writeFile(join(directory, "src/App.tsx"), source);
  const before = await snapshot(directory);
  await expectUpgradeFailure(
    () => upgradeApp(directory, { resolveLock, validateMigration }),
    "Migrate story authoring",
  );
  expect(await readFile(join(directory, "src/App.tsx"), "utf8")).toBe(source);
  expect(await snapshot(directory)).toEqual(before);
});

test("an incompatible namespace component rolls back after actual consumer validation", async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, "src/custom.tsx"),
    'import * as UI from "@altertable/data-app/react"; export function Custom() { return <UI.StorySection label="Legacy" visual={<p>Chart</p>} />; }\n',
  );
  const install = Bun.spawn([process.execPath, "install", "--ignore-scripts"], {
    cwd: directory,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(install.stdout).text(),
    new Response(install.stderr).text(),
    install.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
  await writeFile(join(directory, "node_modules/custom-marker.txt"), "original install");
  const installedPackage = await readFile(
    join(directory, "node_modules/@altertable/data-app/package.json"),
    "utf8",
  );
  const before = await snapshot(directory);
  await expectUpgradeFailure(() => upgradeApp(directory), "The app needs source changes");
  expect(await readFile(join(directory, "node_modules/custom-marker.txt"), "utf8")).toBe(
    "original install",
  );
  expect(
    await readFile(join(directory, "node_modules/@altertable/data-app/package.json"), "utf8"),
  ).toBe(installedPackage);
  expect(await snapshot(directory)).toEqual(before);
  expect(await readFile(join(directory, "src/custom.tsx"), "utf8")).toContain("UI.StorySection");
}, 60_000);
