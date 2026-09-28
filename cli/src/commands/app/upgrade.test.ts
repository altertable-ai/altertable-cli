import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createAppFiles,
  readDataAppPayload,
  runtimeIntegrity,
} from "@/commands/app/lib/distribution.ts";
import { installedRuntimeIntegrity } from "@/commands/app/lib/runtime.ts";
import { upgradeApp } from "@/commands/app/upgrade.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "runtime-upgrade-"));
  directories.push(directory);
  const payload = await readDataAppPayload();
  for (const [name, content] of Object.entries(
    createAppFiles(payload, {
      name: "upgrade-test",
      title: "Test",
      scope: { organization: "Test", environment: "test" },
    }),
  )) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), content);
  }
  return { directory, files: { ...payload.runtime } };
}
async function snapshot(directory: string) {
  return Promise.all(
    [
      "package.json",
      "bun.lock",
      ".altertable/runtime/integrity.json",
      ".altertable/runtime/package.json",
    ].map((name) => readFile(join(directory, name), "utf8")),
  );
}

test("dependency changes regenerate the lock and support a frozen installation", async () => {
  const { directory, files } = await fixture();
  const pkg = JSON.parse(files["package.json"]!);
  pkg.dependencies["@floating-ui/core"] = "1.7.5";
  files["package.json"] = JSON.stringify(pkg);
  const originalApp = await readFile(join(directory, "src/App.tsx"), "utf8");
  const before = await readFile(join(directory, "bun.lock"), "utf8");
  expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
  expect(await readFile(join(directory, "bun.lock"), "utf8")).not.toBe(before);
  const child = Bun.spawn([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: directory,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  expect(await child.exited, stderr).toBe(0);
  expect(await readFile(join(directory, "src/App.tsx"), "utf8")).toBe(originalApp);
  delete pkg.dependencies["@floating-ui/core"];
  files["package.json"] = JSON.stringify(pkg);
  expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
  expect(await installedRuntimeIntegrity(directory)).toEqual(runtimeIntegrity(files));
});

test("failed dependency resolution rolls back runtime, added peer, and lockfile", async () => {
  const { directory, files } = await fixture();
  const app = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  delete app.dependencies["react-dom"];
  await writeFile(join(directory, "package.json"), JSON.stringify(app));
  files["src/format.ts"] += "\n// changed\n";
  const before = await snapshot(directory);
  const failure = await upgradeApp(directory, {
    runtimeFiles: files,
    async resolveLock(path) {
      expect(
        JSON.parse(await readFile(join(path, "package.json"), "utf8")).dependencies["react-dom"],
      ).toBe("19.3.0");
      await writeFile(join(path, "bun.lock"), "partial lock");
      throw new Error("resolution failed");
    },
  }).catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: "resolution failed" });
  expect(await snapshot(directory)).toEqual(before);
});

test("an incompatible new peer requirement fails before mutation", async () => {
  const { directory, files } = await fixture();
  const pkg = JSON.parse(files["package.json"]!);
  pkg.peerDependencies.react = ">=99";
  files["package.json"] = JSON.stringify(pkg);
  const before = await snapshot(directory);
  const failure = await upgradeApp(directory, { runtimeFiles: files }).catch(
    (error: unknown) => error,
  );
  expect(failure).toMatchObject({ message: expect.stringContaining("Runtime needs react@>=99") });
  expect(await snapshot(directory)).toEqual(before);
});

test("removed runtime files trigger an upgrade even without a version change", async () => {
  const { directory, files } = await fixture();
  delete files["src/assets.d.ts"];
  expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
  expect(await Bun.file(join(directory, ".altertable/runtime/src/assets.d.ts")).exists()).toBe(
    false,
  );
});

test("legacy generated apps migrate internal paths while keeping app source and public exports", async () => {
  const { directory, files } = await fixture();
  const legacy = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name.replace(/^src\//, ""), content]),
  );
  const pkg = JSON.parse(legacy["package.json"]!);
  pkg.version = "0.57.0";
  pkg.exports = Object.fromEntries(
    Object.entries(pkg.exports).map(([name, path]) => [name, String(path).replace("./src/", "./")]),
  );
  legacy["package.json"] = JSON.stringify(pkg);
  await rm(join(directory, ".altertable/runtime"), { recursive: true });
  for (const [name, content] of Object.entries(legacy)) {
    await mkdir(dirname(join(directory, ".altertable/runtime", name)), { recursive: true });
    await writeFile(join(directory, ".altertable/runtime", name), content);
  }
  await writeFile(
    join(directory, ".altertable/runtime/integrity.json"),
    JSON.stringify(runtimeIntegrity(legacy)),
  );
  const appSource = await readFile(join(directory, "src/App.tsx"), "utf8");
  expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
  expect(await Bun.file(join(directory, ".altertable/runtime/server.ts")).exists()).toBe(false);
  expect(await Bun.file(join(directory, ".altertable/runtime/src/server.ts")).exists()).toBe(true);
  expect(await readFile(join(directory, "src/App.tsx"), "utf8")).toBe(appSource);
  expect(await installedRuntimeIntegrity(directory)).toEqual(runtimeIntegrity(files));
});

test("missing peers are installed from starter defaults without replacing app customizations", async () => {
  const { directory, files } = await fixture();
  const app = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  delete app.dependencies["react-dom"];
  app.scripts.custom = "echo user-owned";
  await writeFile(join(directory, "package.json"), JSON.stringify(app));
  expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
  expect(JSON.parse(await readFile(join(directory, "package.json"), "utf8"))).toMatchObject({
    dependencies: { "react-dom": "19.3.0" },
    scripts: { custom: "echo user-owned" },
  });
});

test.each(["^19.0.0", ">=19"])("compatible locked peer range %s is preserved", async (range) => {
  const { directory, files } = await fixture();
  const app = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  app.dependencies.react = range;
  const source = JSON.stringify(app);
  await writeFile(join(directory, "package.json"), source);
  files["src/format.ts"] += "\n// source change\n";
  expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
  expect(await readFile(join(directory, "package.json"), "utf8")).toBe(source);
});

test("unchanged peer requirements still reject incompatible app dependencies", async () => {
  const { directory, files } = await fixture();
  const app = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  app.dependencies.react = "^18.0.0";
  await writeFile(join(directory, "package.json"), JSON.stringify(app));
  files["src/format.ts"] += "\n// source change\n";
  const before = await snapshot(directory);
  const failure = await upgradeApp(directory, { runtimeFiles: files }).catch(
    (error: unknown) => error,
  );
  expect(failure).toMatchObject({ message: expect.stringContaining("Runtime needs react@>=19") });
  expect(await snapshot(directory)).toEqual(before);
});
