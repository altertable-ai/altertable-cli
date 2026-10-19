import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  fileDevRuntimeDirectory,
  prepareFileDevRuntime,
  previewAppFile,
  writeFileDevRuntime,
} from "@/commands/app/lib/file-dev.ts";
import { recommendedDataAppVersion } from "@/commands/app/lib/package.ts";
import { dataAppDirectory } from "@/commands/app/lib/distribution.ts";
import { startAppDevProxy } from "@/commands/app/lib/dev-proxy.ts";
import { EXIT_GENERIC } from "@/lib/errors.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { FROM_ENV_PSEUDOPROFILE_NAME } from "@/lib/profile-store.ts";

type ProcessCall = { args: readonly string[]; directory: string; env?: Record<string, string> };

const directories: string[] = [];
const processes: Bun.Subprocess[] = [];
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
  for (const child of processes.splice(0)) {
    child.kill();
    await child.exited;
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
  const directory = await mkdtemp(join(tmpdir(), "file-dev-"));
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

  await prepareFileDevRuntime(directory, run);
  expect(calls).toEqual([
    { args: ["install", "--frozen-lockfile", "--production"], directory, env: undefined },
  ]);
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  expect(manifest.dependencies["@altertable/data-app"]).toBe(recommendedDataAppVersion());
  expect(manifest.name).toBe("altertable-file-dev");
  expect(await readFile(join(directory, "server.ts"), "utf8")).toContain("localLakehouse");

  await expectFailure(
    () => prepareFileDevRuntime(directory, recordProcesses([1]).run),
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
  const { calls, run } = recordProcesses([0, 3]);

  expect(await previewAppFile(file, "3022", execution, run)).toBe(EXIT_GENERIC);
  const runtime = fileDevRuntimeDirectory();
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
      previewAppFile(
        file,
        "3022",
        { profile: FROM_ENV_PSEUDOPROFILE_NAME } as ExecutionContext,
        run,
      ),
    "data app file scope",
  );
  await expectFailure(
    () =>
      previewAppFile(
        home,
        "3022",
        { profile: FROM_ENV_PSEUDOPROFILE_NAME } as ExecutionContext,
        run,
      ),
    "Could not read source",
  );
  expect(calls).toEqual([]);
});

test("serves a single file and forwards same-origin SQL from the preview server", async () => {
  const root = await tempDir();
  const runtime = join(root, "runtime");
  const appFile = join(root, "index.tsx");
  await writeFileDevRuntime(runtime);
  await symlink(join(dataAppDirectory, "starter/node_modules"), join(runtime, "node_modules"));
  const queries: unknown[] = [];
  const proxy = startAppDevProxy({} as ExecutionContext, async (request) => {
    queries.push(JSON.parse(request.body as string));
    return new Response('{"query_id":"q1"}\n[{"name":"value","type":"INTEGER"}]\n[1]\n').body!;
  });
  await writeFile(appFile, appSource("Preview"));

  const stderr: string[] = [];
  const child = Bun.spawn([process.execPath, "server.ts"], {
    cwd: runtime,
    env: {
      ...process.env,
      ALTERTABLE_APP_FILE: appFile,
      ...proxy.environment,
      PORT: "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  processes.push(child);
  void child.exited.finally(() => proxy.stop());
  drain(child.stderr, stderr);
  const url = await readServerUrl(child, stderr);
  const origin = url.slice(0, -1);
  function query(body: string, headers: Record<string, string> = { origin }) {
    return fetch(`${url}api/sql`, { method: "POST", headers, body });
  }

  const page = await fetch(url);
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toContain("text/html");

  const bundle = await (await fetch(`${url}bundle.js`)).text();
  expect(bundle).toContain("Preview");
  expect(bundle).not.toContain(proxy.environment.ALTERTABLE_DATA_PROXY_TOKEN);

  const accepted = await query(
    JSON.stringify({ statement: "select 1", limit: 1, params: { groupName: "Alpha" } }),
    { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
  );
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toEqual({
    columns: [{ name: "value", type: "INTEGER" }],
    rows: [[1]],
    queryId: "q1",
  });

  expect(queries).toEqual([
    expect.objectContaining({
      statement: "select 1",
      params: { groupName: "Alpha" },
    }),
  ]);
  expect((await query("{")).status).toBe(400);
  expect((await query(JSON.stringify({ statement: "select 1", limit: 0 }))).status).toBe(400);
  expect((await fetch(`${url}missing`)).status).toBe(404);

  const valid = JSON.stringify({ statement: "select 1", limit: 1 });
  expect((await query(valid, {})).status).toBe(403);
  expect((await query(valid, { origin: "https://example.com" })).status).toBe(403);
  expect((await query(valid, { origin, "sec-fetch-site": "cross-site" })).status).toBe(403);
  const rebound = await fetch(`${url}bundle.js`, { headers: { host: "attacker.example" } });
  expect(rebound.status).toBe(403);

  await writeFile(appFile, appSource("Updated"));
  await Bun.sleep(500);
  expect(await (await fetch(`${url}bundle.js`)).text()).toContain("Updated");

  const reload = await fetch(`${url}reload`);
  const reader = reload.body?.getReader();
  expect(reader).toBeDefined();
  expect(await readUntil(reader!, "event: ready")).toContain("event: ready");
  await writeFile(appFile, appSource("Reloaded"));
  const events = await readUntil(reader!, "data:");
  expect(events).toContain("data:");
  expect(await (await fetch(`${url}bundle.js`)).text()).toContain("Reloaded");
  await reader?.cancel();
}, 15_000);

function scopedApp(environment: string): string {
  return `import { defineDataApp } from "@altertable/data-app";
const app = defineDataApp({ scope: { organization: "acme", environment: "${environment}" } });
`;
}

function appSource(title: string): string {
  return `import { defineDataApp } from "@altertable/data-app";
const app = defineDataApp({ title: ${JSON.stringify(title)} });
export function View() {
  return <p>{app.title}</p>;
}
`;
}

function drain(stream: ReadableStream<Uint8Array>, chunks: string[]): void {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(decoder.decode(value));
    }
  })();
}

async function readServerUrl(child: Bun.Subprocess, stderr: string[]): Promise<string> {
  const stdout = child.stdout;
  if (!(stdout instanceof ReadableStream)) throw new Error("Missing preview server output.");
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      child.exited.then(() => ({ done: true as const, value: undefined })),
    ]);
    if (next.done) break;
    text += decoder.decode(next.value);
    const match = text.match(/http:\/\/127\.0\.0\.1:\d+\//);
    if (match) return match[0];
  }
  throw new Error(`Preview server did not start.\n${text}\n${stderr.join("")}`);
}

async function readUntil(
  reader: { read(): Promise<{ done: boolean; value?: Uint8Array }> },
  needle: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline && !text.includes(needle)) {
    const next = await Promise.race([
      reader.read(),
      Bun.sleep(200).then(() => ({ done: false as const, value: undefined })),
    ]);
    if (next.done) break;
    if (next.value) text += decoder.decode(next.value);
  }
  return text;
}
