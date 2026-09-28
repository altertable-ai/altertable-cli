import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import { upgradeApp } from "@/commands/app/upgrade.ts";
import {
  currentRuntimeIntegrity,
  installedRuntimeIntegrity,
  readRuntimeSource,
} from "@/commands/app/lib/runtime.ts";
import { configSet, ensureProfileExists, setActiveProfile } from "@/lib/profile-store.ts";

let home: string;
let previousConfigHome: string | undefined;
let previousProfile: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "altertable-app-create-"));
  previousConfigHome = process.env.ALTERTABLE_CONFIG_HOME;
  previousProfile = process.env.ALTERTABLE_PROFILE;
  process.env.ALTERTABLE_CONFIG_HOME = home;
  delete process.env.ALTERTABLE_PROFILE;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (previousConfigHome === undefined) delete process.env.ALTERTABLE_CONFIG_HOME;
  else process.env.ALTERTABLE_CONFIG_HOME = previousConfigHome;
  if (previousProfile === undefined) delete process.env.ALTERTABLE_PROFILE;
  else process.env.ALTERTABLE_PROFILE = previousProfile;
});

describe("app create", () => {
  test("creates a self-contained offline project when explicitly requested", async () => {
    const directory = join(home, "product-pulse");
    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "product-pulse",
      "--dir",
      directory,
      "--without-profile",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      name: "product-pulse",
      directory,
      scope: { organization: "Your organization", environment: "your environment" },
      scopeSource: "placeholder",
      nextSteps: ["altertable app dev", "altertable app check", "altertable app build"],
    });
    expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))).toMatchObject({
      name: "product-pulse",
      scripts: {
        typecheck: "tsc --noEmit",
        lint: "oxlint --type-aware src",
        format: "oxfmt src",
        "format:check": "oxfmt --check src",
        dev: "bun --hot src/server.ts",
      },
    });
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8"))).toMatchObject({
      title: "Product Pulse",
      scope: { organization: "Your organization", environment: "your environment" },
      operations: { connection: {} },
    });
    expect(readFileSync(join(directory, "bun.lock"), "utf8")).toContain('"name": "product-pulse"');
    expect(await installedRuntimeIntegrity(directory)).toEqual(currentRuntimeIntegrity());
    const paths = JSON.parse(result.stdout[0]!).files as string[];
    expect(paths).toContain(".altertable/runtime/src/ui/PlayStory.tsx");
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("docs/data.md");
    expect(paths).toContain(".altertable/runtime/README.md");
    expect(Bun.spawnSync(["git", "init", "--quiet"], { cwd: directory }).exitCode).toBe(0);
    const ignored = Bun.spawnSync(
      [
        "git",
        "-c",
        "core.excludesFile=/dev/null",
        "check-ignore",
        "--no-index",
        ".altertable/runtime/package.json",
      ],
      { cwd: directory },
    );
    expect(ignored.exitCode).toBe(1);
    expect(paths.some((path) => /tests|fixtures|node_modules|\.txt$/.test(path))).toBe(false);
  });

  test("requires an organization and environment before creating a default app", async () => {
    const directory = join(home, "unconfigured-app");

    expect(
      runCommandWithTestRuntime(["app", "create", "unconfigured-app", "--dir", directory]),
    ).rejects.toThrow('Profile "default" needs an organization and environment');
    expect(existsSync(directory)).toBe(false);
  });

  test("selected profile seeds the manifest and reports its scope to agents", async () => {
    ensureProfileExists("altertable_production");
    configSet("organization_slug", "altertable", "altertable_production");
    configSet("organization_name", "Altertable", "altertable_production");
    configSet("api_key_env", "production", "altertable_production");
    const directory = join(home, "profiled-app");

    const result = await runCommandWithTestRuntime(
      ["app", "create", "profiled-app", "--dir", directory],
      { debug: false, json: false, agent: true, profile: "altertable_production" },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "Altertable", environment: "production" },
      scopeSource: "profile",
      profile: "altertable_production",
      organizationSlug: "altertable",
      nextSteps: [
        "altertable --profile altertable_production app dev",
        "altertable --profile altertable_production app check",
        "altertable --profile altertable_production app build",
      ],
    });
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8"))).toMatchObject({
      scope: { organization: "Altertable", environment: "production" },
    });
    expect(readFileSync(join(directory, "src/index.html"), "utf8")).toContain(
      "<title>Altertable app</title>",
    );
  });

  test("a complete active profile seeds scope without an extra flag", async () => {
    ensureProfileExists("current");
    configSet("organization_slug", "cousteau", "current");
    configSet("organization_name", "Cousteau", "current");
    configSet("api_key_env", "production", "current");
    setActiveProfile("current");
    const directory = join(home, "active-app");

    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "active-app",
      "--dir",
      directory,
    ]);

    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "Cousteau", environment: "production" },
      scopeSource: "profile",
      profile: "current",
    });
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8")).scope).toEqual({
      organization: "Cousteau",
      environment: "production",
    });
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("config={app}");
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).not.toContain("{{APP_TITLE}}");
  });

  test("without-profile keeps offline scaffolding available with an active profile", async () => {
    ensureProfileExists("current");
    configSet("organization_slug", "cousteau", "current");
    configSet("api_key_env", "production", "current");
    setActiveProfile("current");
    const directory = join(home, "offline-app");

    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "offline-app",
      "--dir",
      directory,
      "--without-profile",
    ]);

    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "Your organization", environment: "your environment" },
      scopeSource: "placeholder",
    });
  });

  test("a partially configured active profile stops before writing", async () => {
    ensureProfileExists("current");
    configSet("organization_slug", "cousteau", "current");
    setActiveProfile("current");
    const directory = join(home, "partial-app");

    let failure: unknown;
    try {
      await runCommandWithTestRuntime(["app", "create", "partial-app", "--dir", directory]);
    } catch (error) {
      failure = error;
    }
    expect((failure as Error).message).toContain("needs an organization and environment");
    expect(existsSync(directory)).toBe(false);
  });

  test("profile display names are escaped for each generated file format", async () => {
    ensureProfileExists("special");
    configSet("organization_slug", "acme", "special");
    configSet("organization_name", 'Acme "North" & Co', "special");
    configSet("api_key_env", "production", "special");
    const directory = join(home, "special-app");

    const result = await runCommandWithTestRuntime(
      ["app", "create", "special-app", "--dir", directory],
      { debug: false, json: true, agent: false, profile: "special" },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8")).scope.organization).toBe(
      'Acme "North" & Co',
    );
    expect(readFileSync(join(directory, "src/index.html"), "utf8")).toContain(
      "<title>Altertable app</title>",
    );
  });

  test("an incomplete active profile stops before writing", async () => {
    ensureProfileExists("current");
    setActiveProfile("current");
    const directory = join(home, "incomplete-app");

    let failure: unknown;
    try {
      await runCommandWithTestRuntime(["app", "create", "incomplete-app", "--dir", directory]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("needs an organization and environment");
    expect(existsSync(directory)).toBe(false);

    configSet("organization_slug", "cousteau", "current");
    configSet("api_key_env", "staging", "current");
    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "incomplete-app",
      "--dir",
      directory,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "cousteau", environment: "staging" },
      profile: "current",
    });
  });

  test("installs the generated app with its frozen lockfile and checks the project", async () => {
    const directory = join(home, "first-check");
    await runCommandWithTestRuntime([
      "app",
      "create",
      "first-check",
      "--dir",
      directory,
      "--without-profile",
    ]);
    const install = Bun.spawnSync([process.execPath, "install", "--frozen-lockfile"], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(install.exitCode).toBe(0);
    const result = await runCommandWithTestRuntime(["app", "check", "--dir", directory], {
      debug: false,
      json: false,
      agent: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("client bundle clean");
  });

  test("never overwrites an existing directory", async () => {
    const directory = join(home, "existing");
    const marker = join(directory, "keep.txt");
    await runCommandWithTestRuntime([
      "app",
      "create",
      "existing",
      "--dir",
      directory,
      "--without-profile",
    ]);
    writeFileSync(marker, "keep");

    expect(
      runCommandWithTestRuntime([
        "app",
        "create",
        "existing",
        "--dir",
        directory,
        "--without-profile",
      ]),
    ).rejects.toThrow("Directory already exists");
    expect(readFileSync(marker, "utf8")).toBe("keep");
  });

  test("rejects names that cannot safely become project names", async () => {
    for (const name of ["../outside", "Product Pulse", "product_pulse", "app-"]) {
      expect(
        runCommandWithTestRuntime(["app", "create", name, "--dir", join(home, "app")]),
      ).rejects.toThrow("lowercase kebab-case");
    }
    expect(existsSync(join(home, "app"))).toBe(false);
  });

  test("writes a concise human completion message", async () => {
    const directory = join(home, "first-app");
    const result = await runCommandWithTestRuntime(
      ["app", "create", "first-app", "--dir", directory, "--without-profile"],
      { debug: false, json: false, agent: false },
    );
    expect(result.stdout.join("\n")).toContain("Organization/environment:");
    expect(result.stdout.join("\n")).toContain("From that directory, run altertable app dev.");
  });

  test("returns the created directory in agent output", async () => {
    const directory = join(home, "agent-app");
    const result = await runCommandWithTestRuntime(
      ["app", "create", "agent-app", "--dir", directory, "--without-profile"],
      { debug: false, json: false, agent: true },
    );
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({ name: "agent-app", directory });
  });

  test("upgrade preserves app-owned changes and refuses a modified runtime", async () => {
    const directory = join(home, "upgrade-app");
    await runCommandWithTestRuntime([
      "app",
      "create",
      "upgrade-app",
      "--dir",
      directory,
      "--without-profile",
    ]);
    const operations = join(directory, "src/operations.ts");
    writeFileSync(operations, `${readFileSync(operations, "utf8")}\n// App-specific change.\n`);
    const current = await runCommandWithTestRuntime(["app", "upgrade", "--dir", directory], {
      debug: false,
      json: false,
      agent: false,
    });
    expect(current.stdout.join("\n")).toContain("already current");
    expect(readFileSync(operations, "utf8")).toContain("App-specific change");

    const runtime = join(directory, ".altertable/runtime/src/server.ts");
    writeFileSync(runtime, `${readFileSync(runtime, "utf8")}\n// Local edit.\n`);
    expect(runCommandWithTestRuntime(["app", "upgrade", "--dir", directory])).rejects.toThrow(
      "was modified",
    );
    expect(readFileSync(runtime, "utf8")).toContain("Local edit");
  });

  test("source watch upgrade updates integrity and stops on generated edits", async () => {
    const directory = join(home, "watched-app");
    await runCommandWithTestRuntime([
      "app",
      "create",
      "watched-app",
      "--dir",
      directory,
      "--without-profile",
    ]);
    const files = await readRuntimeSource();
    files["src/format.ts"] += "\n// Changed source.\n";
    expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
    expect(readFileSync(join(directory, ".altertable/runtime/src/format.ts"), "utf8")).toContain(
      "Changed source",
    );
    expect((await installedRuntimeIntegrity(directory)).sha256).toEqual(
      currentRuntimeIntegrity(files).sha256,
    );

    const generated = join(directory, ".altertable/runtime/src/format.ts");
    writeFileSync(generated, `${readFileSync(generated, "utf8")}\n// App edit.\n`);
    expect(upgradeApp(directory, { runtimeFiles: await readRuntimeSource() })).rejects.toThrow(
      "format.ts was modified",
    );
  });

  test("invalid lockfile leaves the installed runtime unchanged", async () => {
    const directory = join(home, "invalid-lock-app");
    await runCommandWithTestRuntime([
      "app",
      "create",
      "invalid-lock-app",
      "--dir",
      directory,
      "--without-profile",
    ]);
    const integrityPath = join(directory, ".altertable/runtime/integrity.json");
    const integrity = JSON.parse(readFileSync(integrityPath, "utf8")) as { version: string };
    integrity.version = "0.1.0";
    writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`);
    const runtimePath = join(directory, ".altertable/runtime/src/server.ts");
    const beforeRuntime = readFileSync(runtimePath, "utf8");
    const beforeIntegrity = readFileSync(integrityPath, "utf8");
    const lockPath = join(directory, "bun.lock");
    const validLock = readFileSync(lockPath, "utf8");
    rmSync(lockPath);
    expect(upgradeApp(directory)).rejects.toThrow("valid bun.lock");
    expect(readFileSync(integrityPath, "utf8")).toBe(beforeIntegrity);
    writeFileSync(lockPath, "{ invalid lockfile");

    expect(upgradeApp(directory)).rejects.toThrow("valid bun.lock");
    expect(readFileSync(runtimePath, "utf8")).toBe(beforeRuntime);
    expect(readFileSync(integrityPath, "utf8")).toBe(beforeIntegrity);
    writeFileSync(lockPath, validLock);
    expect(await upgradeApp(directory)).toBe(true);
  });

  test("upgrade rolls back a failure after applying runtime files", async () => {
    const directory = join(home, "rollback-app");
    await runCommandWithTestRuntime([
      "app",
      "create",
      "rollback-app",
      "--dir",
      directory,
      "--without-profile",
    ]);
    const integrityPath = join(directory, ".altertable/runtime/integrity.json");
    const integrity = JSON.parse(readFileSync(integrityPath, "utf8")) as { version: string };
    integrity.version = "0.1.0";
    writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`);
    const paths = [integrityPath, join(directory, "package.json"), join(directory, "bun.lock")];
    const before = paths.map((path) => readFileSync(path, "utf8"));

    expect(
      upgradeApp(directory, {
        afterApply(path) {
          if (path === join(directory, ".altertable/runtime"))
            throw new Error("Injected write failure");
        },
      }),
    ).rejects.toThrow("Injected write failure");
    expect(paths.map((path) => readFileSync(path, "utf8"))).toEqual(before);
    expect(await upgradeApp(directory)).toBe(true);
  });
});
