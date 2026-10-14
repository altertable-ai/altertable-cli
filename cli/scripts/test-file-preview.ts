import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { previewAppFile } from "@/commands/app/lib/file-preview.ts";
import { runAppProcess } from "@/commands/app/lib/run.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { getCliRuntime } from "@/lib/runtime.ts";
import { createLakehouseTestWorkspace } from "@/test-utils/lakehouse.ts";

test("launches the published preview runtime with isolated credentials, SQL, reloads and cleanup", async () => {
  const workspace = createLakehouseTestWorkspace("file-preview");
  const home = await mkdtemp(join(tmpdir(), "file-preview-runtime-"));
  const previousHome = process.env.ALTERTABLE_CONFIG_HOME;
  const previousEnvironment = process.env.ALTERTABLE_ENV;
  const previousApiKey = process.env.ALTERTABLE_API_KEY;
  const requests: { authorization: string | null; body: unknown }[] = [];
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({
        authorization: request.headers.get("authorization"),
        body: await request.json(),
      });
      return new Response(
        ['{"query_id":"preview-query"}', '[{"name":"value","type":"INTEGER"}]', "[42]"].join("\n"),
        {
          headers: { "content-type": "application/x-ndjson" },
        },
      );
    },
  });
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port!;
  await reservation.stop(true);
  const url = `http://127.0.0.1:${port}`;
  const cancellation = new AbortController();
  let running: Promise<number> | undefined;
  let proxyUrl: string | undefined;
  let runtimeDirectory: string | undefined;
  let proxyToken: string | undefined;
  try {
    process.env.ALTERTABLE_CONFIG_HOME = home;
    process.env.ALTERTABLE_ENV = "production";
    process.env.ALTERTABLE_API_KEY = "management-secret";
    process.env.ALTERTABLE_API_BASE = upstream.url.origin;
    delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
    const label = join(home, "label.ts");
    await writeFile(label, 'export const label = "Published preview";');
    const file = join(home, "index.tsx");
    const source = `import { defineDataApp } from "@altertable/data-app";
import { mountDataApp } from "@altertable/data-app/react";
import { label } from "./label";
const app = defineDataApp({ title: "CLI preview", scope: { organization: "acme", environment: "production" }, queries: {} });
function View() { return <p>{label}</p>; }
mountDataApp({ app, component: View });`;
    await writeFile(file, source);
    async function run(args: readonly string[], directory: string, env?: Record<string, string>) {
      if (!env) return runAppProcess(args, directory);
      proxyUrl = env.ALTERTABLE_DATA_PROXY_URL;
      proxyToken = env.ALTERTABLE_DATA_PROXY_TOKEN;
      runtimeDirectory = directory;
      const bootstrap = join(directory, "server.ts");
      await writeFile(
        bootstrap,
        `${await readFile(bootstrap, "utf8")}\nawait Bun.write("environment.json", JSON.stringify(Object.keys(process.env).filter((key) => key.startsWith("ALTERTABLE_"))));\n`,
      );
      return runAppProcess(args, directory, env, cancellation.signal);
    }
    running = previewAppFile(file, port, createExecutionContext(getCliRuntime()), run);
    await Promise.race([
      until(async () => (await fetch(url)).status === 200),
      running.then((code) => {
        throw new Error(`Preview exited before starting (${code}).`);
      }),
    ]);
    await until(
      async () => (await readFile(join(runtimeDirectory!, "environment.json"), "utf8")).length > 0,
    );
    const childEnvironment: string[] = JSON.parse(
      await readFile(join(runtimeDirectory!, "environment.json"), "utf8"),
    );
    expect(childEnvironment.sort()).toEqual([
      "ALTERTABLE_APP_FILE",
      "ALTERTABLE_DATA_PROXY_TOKEN",
      "ALTERTABLE_DATA_PROXY_URL",
    ]);
    expect((await fetch(url)).headers.get("content-type")).toContain("text/html");
    const bundle = await (await fetch(`${url}/bundle.js`)).text();
    expect(bundle).toContain("Published preview");
    expect(bundle).not.toContain(proxyToken!);
    expect(bundle).not.toContain("management-secret");
    const body = JSON.stringify({
      statement: "select 42",
      limit: 1,
      params: { groupName: "Alpha" },
    });
    const query = await fetch(`${url}/api/sql`, {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body,
    });
    expect(query.status).toBe(200);
    expect(await query.json()).toMatchObject({ rows: [[42]], queryId: "preview-query" });
    expect(requests).toEqual([
      {
        authorization: `Basic ${Buffer.from("testuser:testpass").toString("base64")}`,
        body: expect.objectContaining({
          statement: "select 42",
          limit: 1,
          params: { groupName: "Alpha" },
        }),
      },
    ]);
    expect((await fetch(`${url}/api/sql`, { method: "POST", body })).status).toBe(403);
    expect(
      (await fetch(`${url}/bundle.js`, { headers: { host: "attacker.example" } })).status,
    ).toBe(403);
    expect(requests).toHaveLength(1);

    const reload = await fetch(`${url}/reload`, { signal: AbortSignal.timeout(15_000) });
    const reader = reload.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("ready");
    await writeFile(`${label}.new`, 'export const label = "Imported file changed";');
    await rename(`${label}.new`, label);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("reload");
    await reader.cancel();
    await until(async () =>
      (await (await fetch(`${url}/bundle.js`)).text()).includes("Imported file changed"),
    );
    await writeFile(file, "export function View( {");
    await until(async () => (await fetch(`${url}/bundle.js`)).status === 500);
    await writeFile(file, source);
    await until(async () => (await fetch(`${url}/bundle.js`)).status === 200);
    cancellation.abort();
    expect(await running).toBe(0);
    expect(
      await fetch(url).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await fetch(proxyUrl!).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    const occupied = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() });
    try {
      const code = await previewAppFile(
        file,
        port,
        createExecutionContext(getCliRuntime()),
        async (args, directory, env) => {
          if (env) proxyUrl = env.ALTERTABLE_DATA_PROXY_URL;
          return runAppProcess(args, directory, env);
        },
      );
      expect(code).toBe(1);
      expect(
        await fetch(proxyUrl!).then(
          () => true,
          () => false,
        ),
      ).toBe(false);
    } finally {
      await occupied.stop(true);
    }
  } finally {
    cancellation.abort();
    await running?.catch(() => undefined);
    await upstream.stop(true);
    workspace.cleanup();
    for (const [key, value] of Object.entries({
      ALTERTABLE_CONFIG_HOME: previousHome,
      ALTERTABLE_ENV: previousEnvironment,
      ALTERTABLE_API_KEY: previousApiKey,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(home, { recursive: true, force: true });
  }
}, 60_000);

async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await Bun.sleep(50);
  }
  throw new Error("Timed out waiting for the published preview runtime.");
}
