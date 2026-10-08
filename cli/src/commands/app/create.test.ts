import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { readDataAppPayload } from "@/commands/app/lib/distribution.ts";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import { recommendedDataAppVersion } from "@/commands/app/lib/package.ts";
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
  test("scaffolds a pinned package project without registry access", async () => {
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
      nextSteps: [
        "Set organization and environment in app.json.",
        "Select a matching profile, or configure one with `altertable login --org <org> --env <env>`.",
        "altertable app dev",
        "altertable app check --lakehouse",
        "altertable app build",
      ],
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
    });
    expect(readFileSync(join(directory, "bun.lock"), "utf8")).toContain('"name": "product-pulse"');
    expect(
      JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).dependencies[
        "@altertable/data-app"
      ],
    ).toBe(recommendedDataAppVersion());
    expect(existsSync(join(directory, ".altertable/runtime"))).toBe(false);
    const paths = JSON.parse(result.stdout[0]!).files as string[];
    expect(paths.some((path) => path.startsWith(".altertable/"))).toBe(false);
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain(".oxlintrc.json");
    expect(readFileSync(join(directory, "AGENTS.md"), "utf8")).toContain(
      "https://github.com/altertable-ai/data-app/blob/main/examples/starter-local-data-app/AGENTS.md",
    );
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain(
      "Connectivity-only screen",
    );
    expect(readFileSync(join(directory, "src/operations.ts"), "utf8")).toContain(
      "supplies no analytical result",
    );
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

  test("installs the generated app with its frozen lockfile and checks authoring links and the project", async () => {
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
    expect(
      JSON.parse(
        readFileSync(join(directory, "node_modules/@altertable/data-app/package.json"), "utf8"),
      ).version,
    ).toBe(recommendedDataAppVersion());
    const { starter } = await readDataAppPayload();
    for (const name of Object.keys(starter)) {
      if (!name.endsWith(".md")) continue;
      const content = readFileSync(join(directory, name), "utf8");
      for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1]!.split("#")[0]!;
        if (!target || /^[a-z]+:\/\//i.test(target)) continue;
        const path = posix.normalize(posix.join(posix.dirname(name), target));
        expect(existsSync(join(directory, path)), `${name} links to missing ${path}`).toBe(true);
      }
    }
    const result = await runCommandWithTestRuntime(["app", "check", "--dir", directory], {
      debug: false,
      json: false,
      agent: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("client credential scan passed");
    writeFileSync(
      join(directory, "src/lint-probe.tsx"),
      'import { useEffect, useState } from "react"; export function Probe() { const [count, setCount] = useState(0); useEffect(() => { setCount(1); }, []); return <div>{count}</div>; }',
    );
    const lint = Bun.spawnSync([process.execPath, "run", "lint"], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(lint.exitCode).toBe(1);
    expect(new TextDecoder().decode(lint.stdout)).toContain("react(set-state-in-effect)");
    writeFileSync(
      join(directory, "src/lint-probe.tsx"),
      'import { operations } from "./operations.ts"; export const probe = operations;',
    );
    const relativeImportLint = Bun.spawnSync([process.execPath, "run", "lint"], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(relativeImportLint.exitCode).toBe(1);
    expect(new TextDecoder().decode(relativeImportLint.stdout)).toContain(
      "eslint(no-restricted-imports)",
    );
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
    expect(result.stdout.join("\n")).toContain("set the organization and environment in app.json");
    expect(result.stdout.join("\n")).toContain("`altertable app build`");
    expect(result.stdout.join("\n")).not.toContain("run altertable app dev.");
  });

  test("returns the created directory in agent output", async () => {
    const directory = join(home, "agent-app");
    const result = await runCommandWithTestRuntime(
      ["app", "create", "agent-app", "--dir", directory, "--without-profile"],
      { debug: false, json: false, agent: true },
    );
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({ name: "agent-app", directory });
  });

  test("upgrade reports the tested package version without changing a current app", async () => {
    const directory = join(home, "current-app");
    await runCommandWithTestRuntime([
      "app",
      "create",
      "current-app",
      "--dir",
      directory,
      "--without-profile",
    ]);
    const operations = join(directory, "src/operations.ts");
    writeFileSync(operations, `${readFileSync(operations, "utf8")}\n// App-specific change.\n`);
    for (const mode of [
      { debug: false, json: true, agent: false },
      { debug: false, json: false, agent: true },
    ]) {
      const result = await runCommandWithTestRuntime(["app", "upgrade", "--dir", directory], mode);
      expect(JSON.parse(result.stdout[0]!)).toEqual({
        directory,
        upgraded: false,
        runtimeVersion: recommendedDataAppVersion(),
        nextSteps: [],
      });
    }
    expect(readFileSync(operations, "utf8")).toContain("App-specific change");
  });
});
