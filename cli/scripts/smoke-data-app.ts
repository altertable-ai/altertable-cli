import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recommendedDataAppVersion } from '@/commands/app/lib/package.ts';
import { loadDataAppPayload } from '@/commands/app/lib/payload.ts';

/** Exercise the shipped CLI outside the checkout, including its embedded starter and published runtime. */
export async function smokeDataApp(
  command: string[],
  scaffoldOnly = false
): Promise<void> {
  const version = recommendedDataAppVersion(await loadDataAppPayload());
  const directory = await mkdtemp(join(tmpdir(), 'altertable-packaged-app-'));
  const app = join(directory, 'app');
  let upstream: Bun.Server<undefined> | undefined;
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith('ALTERTABLE_')) delete env[key];
  // App scripts stream their own output and require human mode.
  env.ALTERTABLE_AGENT_MODE = '0';
  env.ALTERTABLE_CONFIG_HOME = join(directory, 'config');
  async function run(arguments_: string[], cwd: string): Promise<void> {
    const child = Bun.spawn(arguments_, {
      cwd,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0)
      throw new Error(
        `Packaged app smoke failed: ${arguments_.join(' ')}\n${stderr}\n${stdout}`
      );
  }
  async function preview(singleFile = false): Promise<void> {
    const reservation = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => new Response(),
    });
    const port = reservation.port!;
    await reservation.stop(true);
    const url = `http://127.0.0.1:${port}`;
    const child = Bun.spawn(
      [
        ...command,
        'app',
        'dev',
        ...(singleFile ? ['--file', join(app, 'index.tsx')] : ['--dir', app]),
        '--port',
        String(port),
      ],
      {
        cwd: directory,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    const output = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    async function stopPreview(): Promise<void> {
      child.kill('SIGTERM');
      try {
        await withTimeout(
          child.exited,
          5000,
          'Packaged data app preview did not stop.'
        );
      } catch (error) {
        child.kill('SIGKILL');
        await withTimeout(
          child.exited,
          5000,
          'Packaged data app preview could not be killed.'
        );
        throw error;
      }
    }
    let failure: unknown;
    try {
      const deadline = Date.now() + 20_000;
      let ready = false;
      while (Date.now() < deadline && child.exitCode === null) {
        ready = await fetch(`${url}${singleFile ? '/bundle.js' : '/'}`, {
          signal: AbortSignal.timeout(1000),
        })
          .then(async response => {
            await response.text();
            return response.ok;
          })
          .catch(() => false);
        if (ready) break;
        await Bun.sleep(50);
      }
      if (!ready) throw new Error('Packaged data app preview did not start.');
      if (singleFile) {
        const bundle = await fetch(`${url}/bundle.js`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!(await bundle.text()).includes('File preview smoke'))
          throw new Error('File preview did not bundle the app.');
      }
      const query = await fetch(
        `${url}${singleFile ? '/api/query' : '/api/query/totalCost'}`,
        {
          signal: AbortSignal.timeout(5000),
          method: 'POST',
          headers: { origin: url, 'content-type': 'application/json' },
          body: JSON.stringify(
            singleFile
              ? { queryId: 'connection', limit: 1, params: {} }
              : { limit: 1, params: { month: '2026-09', customerName: '' } }
          ),
        }
      );
      if (!query.ok) throw new Error(`Preview SQL failed (${query.status}).`);
      const result = (await query.json()) as {
        rows?: unknown[][];
        data?: unknown;
      };
      if (result.rows?.[0]?.[0] !== (singleFile ? 1 : 1320000))
        throw new Error('Preview did not return the lakehouse query result.');
    } catch (error) {
      failure = error;
    } finally {
      await stopPreview();
    }
    const [stdout, stderr] = await withTimeout(
      output,
      5000,
      'Preview output did not close.'
    );
    if (failure || (singleFile && child.exitCode !== 0))
      throw new Error(
        `Packaged preview failed: ${failure instanceof Error ? failure.message : child.exitCode}\n${stderr}\n${stdout}`
      );
    if (
      await fetch(url, { signal: AbortSignal.timeout(1000) }).then(
        async response => {
          await response.text();
          return true;
        },
        (error: unknown) => {
          if (error instanceof Error && error.name === 'TimeoutError')
            throw error;
          return false;
        }
      )
    )
      throw new Error('Preview is still serving after shutdown.');
  }
  try {
    await run(
      [
        ...command,
        'app',
        'create',
        'package-smoke',
        '--dir',
        app,
        '--without-profile',
      ],
      directory
    );
    const manifest = await Bun.file(join(app, 'package.json')).json();
    for (const name of [
      '@altertable/data-app',
      '@altertable/data-app-react',
      '@altertable/data-app-bun',
    ]) {
      if (manifest.dependencies?.[name] !== version)
        throw new Error(
          `Packaged starter must pin ${name} to the tested release`
        );
    }
    for (const name of [
      '@altertable/data-app-embed',
      '@altertable/data-app-worker',
    ]) {
      if (manifest.dependencies?.[name])
        throw new Error(`Packaged starter does not use ${name}`);
    }
    if (await Bun.file(join(app, '.altertable/runtime/package.json')).exists())
      throw new Error('Packaged starter must not vendor the runtime');
    if (scaffoldOnly) return;
    upstream = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        if (
          request.headers.get('authorization') !==
          `Basic ${Buffer.from('preview-user:preview-smoke-secret').toString('base64')}`
        )
          return new Response('Unauthorized', { status: 401 });
        const { statement } = (await request.json()) as { statement: string };
        return new Response(
          statement === 'SELECT 1 AS connection_check'
            ? '{"query_id":"smoke"}\n[{"name":"connection_check","type":"INTEGER"}]\n[1]'
            : '{"query_id":"smoke"}\n[{"name":"cost_cents","type":"BIGINT"},{"name":"customer_count","type":"BIGINT"}]\n[1320000,3]',
          {
            headers: { 'content-type': 'application/x-ndjson' },
          }
        );
      },
    });
    Object.assign(env, {
      ALTERTABLE_API_BASE: upstream.url.origin,
      ALTERTABLE_LAKEHOUSE_USERNAME: 'preview-user',
      ALTERTABLE_LAKEHOUSE_PASSWORD: 'preview-smoke-secret',
    });
    await run(
      [process.execPath, 'install', '--frozen-lockfile', '--ignore-scripts'],
      app
    );
    await run(
      [
        process.execPath,
        '-e',
        'import { createDataClient } from "@altertable/data-app/client"; import { serveLocalApp } from "@altertable/data-app-bun"; if (typeof createDataClient !== "function" || typeof serveLocalApp !== "function") process.exit(1);',
      ],
      app
    );
    await run([...command, 'app', 'lint', '--dir', app], directory);
    await preview();
    await Bun.write(
      join(app, 'index.tsx'),
      `import { defineDataApp as declareApp } from "@altertable/data-app";
import { mountDataApp } from "@altertable/data-app-react";
const app = declareApp({ title: "File preview smoke", description: "Smoke test", scope: { organization: "Test", environment: "test" }, queries: { connection: { statement: "SELECT 1 AS connection_check", params: {}, projections: { connection_check: { type: "number" } } } } });
function View() { return <p>File preview smoke</p>; }
mountDataApp({ app, component: View });`
    );
    await preview(true);
  } finally {
    await upstream?.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
