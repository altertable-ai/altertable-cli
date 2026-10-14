import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { prepareFilePreviewRuntime, previewAppFile } from "@/commands/app/lib/file-preview.ts";
import { recommendedDataAppVersion } from "@/commands/app/lib/package.ts";
import { EXIT_GENERIC } from "@/lib/errors.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { FROM_ENV_PSEUDOPROFILE_NAME } from "@/lib/profile-store.ts";

type ProcessCall = { args: readonly string[]; directory: string; env?: Record<string, string> };

const directories: string[] = [];
const savedEnvironment: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ["ALTERTABLE_CONFIG_HOME", "ALTERTABLE_ENV"]) {
    savedEnvironment[key] = process.env[key];
  }
});

afterEach(async () => {
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function expectFailure(run: () => Promise<unknown>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await run();
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "file-preview-"));
  directories.push(directory);
  return directory;
}

function recordProcesses(exitCodes: number[] = []) {
  const calls: ProcessCall[] = [];
  async function run(
    args: readonly string[],
    directory: string,
    env?: Record<string, string>,
  ): Promise<number> {
    calls.push({ args, directory, env });
    return exitCodes[calls.length - 1] ?? 0;
  }
  return { calls, run };
}

test("writes and installs the pinned preview runtime", async () => {
  const directory = await tempDir();
  const { calls, run } = recordProcesses();

  await prepareFilePreviewRuntime(directory, run);
  expect(calls).toEqual([
    { args: ["install", "--frozen-lockfile", "--production"], directory, env: undefined },
  ]);
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  expect(manifest.dependencies["@altertable/data-app"]).toBe(recommendedDataAppVersion());
  expect(manifest.name).toBe("data-app-starter");
  const bootstrap = await readFile(join(directory, "server.ts"), "utf8");
  expect(bootstrap).toContain('from "@altertable/data-app/server/bun/preview"');

  await expectFailure(
    () => prepareFilePreviewRuntime(directory, recordProcesses([1]).run),
    "Could not install",
  );
});

test("previews a file through the loopback proxy without profile credentials", async () => {
  const home = await tempDir();
  process.env.ALTERTABLE_CONFIG_HOME = home;
  process.env.ALTERTABLE_ENV = "production";
  const file = join(home, "index.tsx");
  await writeFile(file, scopedApp("production"));
  const execution = { profile: FROM_ENV_PSEUDOPROFILE_NAME } as ExecutionContext;
  const { calls, run: record } = recordProcesses([0, 3]);
  async function run(...args: Parameters<typeof record>): Promise<number> {
    const result = await record(...args);
    if (args[2]) {
      expect((await fetch(args[2].ALTERTABLE_DATA_PROXY_URL!)).status).toBe(401);
    }
    return result;
  }

  expect(await previewAppFile(file, 3022, execution, run)).toBe(EXIT_GENERIC);
  const runtime = join(home, "data-app-dev", recommendedDataAppVersion());
  expect(calls.map((call) => [call.args, call.directory])).toEqual([
    [["install", "--frozen-lockfile", "--production"], runtime],
    [["server.ts"], runtime],
  ]);
  const env = calls[1]!.env!;
  expect(Object.keys(env).sort()).toEqual([
    "ALTERTABLE_APP_FILE",
    "ALTERTABLE_DATA_PROXY_TOKEN",
    "ALTERTABLE_DATA_PROXY_URL",
    "PORT",
  ]);
  expect(env.ALTERTABLE_APP_FILE).toBe(file);
  expect(env.PORT).toBe("3022");
  expect(env.ALTERTABLE_DATA_PROXY_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(env.ALTERTABLE_DATA_PROXY_TOKEN).toMatch(/^[a-f0-9]{64}$/);
  expect(
    await fetch(env.ALTERTABLE_DATA_PROXY_URL!).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

test("refuses a file whose scope does not match the profile before installing", async () => {
  const home = await tempDir();
  process.env.ALTERTABLE_CONFIG_HOME = home;
  process.env.ALTERTABLE_ENV = "production";
  const file = join(home, "index.tsx");
  await writeFile(file, scopedApp("staging"));
  const { calls, run } = recordProcesses();

  await expectFailure(
    () =>
      previewAppFile(file, 3022, { profile: FROM_ENV_PSEUDOPROFILE_NAME } as ExecutionContext, run),
    "data app file scope",
  );
  await expectFailure(
    () =>
      previewAppFile(home, 3022, { profile: FROM_ENV_PSEUDOPROFILE_NAME } as ExecutionContext, run),
    "Could not read source",
  );
  expect(calls).toEqual([]);
});

function scopedApp(environment: string): string {
  return `import { defineDataApp } from "@altertable/data-app";
const app = defineDataApp({ scope: { organization: "acme", environment: "${environment}" } });
`;
}

test("stops the proxy when the preview process fails to launch", async () => {
  const home = await tempDir();
  process.env.ALTERTABLE_CONFIG_HOME = home;
  process.env.ALTERTABLE_ENV = "production";
  const file = join(home, "index.tsx");
  await writeFile(file, scopedApp("production"));
  let proxyUrl: string | undefined;
  async function run(_args: readonly string[], _directory: string, env?: Record<string, string>) {
    if (!env) return 0;
    proxyUrl = env.ALTERTABLE_DATA_PROXY_URL;
    throw new Error("Could not spawn Bun.");
  }
  await expectFailure(
    () =>
      previewAppFile(file, 3022, { profile: FROM_ENV_PSEUDOPROFILE_NAME } as ExecutionContext, run),
    "Could not spawn Bun",
  );
  expect(proxyUrl).toBeDefined();
  expect(
    await fetch(proxyUrl!).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});
