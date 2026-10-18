import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = join(dirname(fileURLToPath(import.meta.url)), "../cli/src/cli.ts");
let root: string;
let project: string;
let home: string;
let environment: Record<string, string>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "altertable-user-directories-"));
  project = join(root, "project");
  home = join(root, "home");
  await mkdir(project);
  await mkdir(home);
  environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith("ALTERTABLE_") && !name.startsWith("XDG_")) {
      environment[name] = value;
    }
  }
  Object.assign(environment, {
    HOME: home,
    USERPROFILE: home,
    ALTERTABLE_SECRET_BACKEND: "file",
    ALTERTABLE_AGENT_MODE: "0",
    ALTERTABLE_NO_UPDATE_CHECK: "1",
    NO_COLOR: "1",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(root, "bun-cache"),
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function run(arguments_: string[], cwd = project, stdin?: string) {
  const child = Bun.spawn([process.execPath, cliPath, ...arguments_], {
    cwd,
    env: environment,
    stdin: stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined && child.stdin) {
    child.stdin.write(stdin);
    child.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function configure() {
  return run(
    ["profile", "configure", "--api-key-stdin", "--env", "production", "--json"],
    project,
    "atm_directory_test\n",
  );
}

for (const source of ["HOME", "XDG_CONFIG_HOME", "ALTERTABLE_CONFIG_HOME"] as const) {
  test(`credentials and profiles stay accessible across working directories using ${source}`, async () => {
    const configHome = join(root, "settings");
    let configDir = join(home, ".config", "altertable");
    if (source === "HOME") {
      environment.XDG_CONFIG_HOME = "";
      environment.ALTERTABLE_CONFIG_HOME = "";
    }
    if (source === "XDG_CONFIG_HOME") {
      environment.XDG_CONFIG_HOME = configHome;
      environment.HOME = "ignored-relative-home";
      configDir = join(configHome, "altertable");
    }
    if (source === "ALTERTABLE_CONFIG_HOME") {
      environment.ALTERTABLE_CONFIG_HOME = configHome;
      environment.XDG_CONFIG_HOME = "ignored-relative-path";
      environment.HOME = "ignored-relative-home";
      configDir = configHome;
    }
    const saved = await configure();
    expect(saved.exitCode).toBe(0);
    expect(await Bun.file(join(configDir, "credentials")).text()).toContain("atm_directory_test");
    const shown = await run(["profile", "show", "--json"], root);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout).profile.auth.management).toBe("api_key");
    expect(JSON.parse(shown.stdout).profile.config_file).toBe(
      join(configDir, "profiles", "default", "config"),
    );
    expect(shown.stdout).not.toContain("atm_directory_test");
    expect(await readdir(project)).toEqual([]);
  });
}

for (const source of ["HOME", "XDG_CONFIG_HOME", "ALTERTABLE_CONFIG_HOME"] as const) {
  test(`refuses relative ${source} before writing config or credentials`, async () => {
    environment[source] = "relative-settings";
    const result = await configure();
    expect(result.exitCode).toBe(10);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).message).toContain(source);
    expect(result.stderr).toContain("absolute");
    expect(await readdir(project)).toEqual([]);
    expect(await readdir(home)).toEqual([]);
  });
}

for (const [shell, source] of [
  ["fish", "XDG_CONFIG_HOME"],
  ["bash", "XDG_DATA_HOME"],
  ["zsh", "HOME"],
] as const) {
  test(`completion install refuses relative ${source} without writing shell files`, async () => {
    environment.ALTERTABLE_CONFIG_HOME = join(root, "settings");
    environment[source] = "relative-settings";
    const result = await run(["completion", "install", shell, "--json"]);
    expect(result.exitCode).toBe(10);
    expect(result.stderr).toContain(source);
    expect(await readdir(project)).toEqual([]);
    expect(await readdir(home)).toEqual([]);
  });
}

test("completion and profile storage share the XDG config root", async () => {
  environment.XDG_CONFIG_HOME = join(root, "xdg");
  expect((await configure()).exitCode).toBe(0);
  const completion = await run(["completion", "install", "fish", "--json"]);
  expect(completion.exitCode).toBe(0);
  const path = join(root, "xdg", "fish", "completions", "altertable.fish");
  expect(JSON.parse(completion.stdout).completionPath).toBe(path);
  expect(await Bun.file(path).text()).toContain("complete");
  expect(existsSync(join(project, ".config"))).toBe(false);
});

if (process.platform === "win32") {
  test("PowerShell without HOME stores credentials under USERPROFILE", async () => {
    delete environment.HOME;
    expect((await configure()).exitCode).toBe(0);
    expect(await Bun.file(join(home, ".config", "altertable", "credentials")).text()).toContain(
      "atm_directory_test",
    );
    expect((await run(["profile", "show", "--json"], root)).exitCode).toBe(0);
    expect(await readdir(project)).toEqual([]);
  });

  for (const path of ["C:settings", "\\settings", "/settings"]) {
    test(`refuses drive-dependent config path ${path}`, async () => {
      environment.ALTERTABLE_CONFIG_HOME = path;
      expect((await configure()).exitCode).toBe(10);
      expect(await readdir(project)).toEqual([]);
    });
  }
}
