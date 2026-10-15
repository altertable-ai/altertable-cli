import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import serverScript from "@/commands/app/lib/file-dev-server.ts.txt";
import hostPage from "@/commands/app/lib/file-dev-host.html.txt";
import hostScript from "@/commands/app/lib/file-dev-host.js.txt";
import { readDeclaredAppScope } from "@/commands/app/lib/declared-app.ts";
import { startAppDevProxy } from "@/commands/app/lib/dev-proxy.ts";
import { createAppFiles } from "@/commands/app/lib/distribution.ts";
import { recommendedDataAppVersion } from "@/commands/app/lib/package.ts";
import { dataAppPayload } from "@/commands/app/lib/payload.ts";
import { readRequiredFile } from "@/commands/app/lib/remote.ts";
import { runAppProcess } from "@/commands/app/lib/run.ts";
import { assertAppScope, profileAppScope } from "@/commands/app/lib/scope.ts";
import { configDir } from "@/lib/config-files.ts";
import { CliError, EXIT_GENERIC } from "@/lib/errors.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";

export const fileDevPort = "25837";

export function fileDevRuntimeDirectory(): string {
  return join(configDir(), "data-app-dev", recommendedDataAppVersion());
}

export async function writeFileDevRuntime(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(runtimeFiles()).map(([name, content]) =>
      writeFile(join(directory, name), content),
    ),
  );
}

/** The frozen lockfile pins the package version; an installed runtime makes this an offline no-op. */
export async function prepareFileDevRuntime(
  directory: string,
  run: typeof runAppProcess = runAppProcess,
): Promise<void> {
  await writeFileDevRuntime(directory);
  if ((await run(["install", "--frozen-lockfile", "--production"], directory)) !== 0) {
    throw new CliError("Could not install the data app package used to preview a single file.");
  }
}

export async function previewAppFile(
  file: string,
  port: string,
  execution: ExecutionContext,
  run: typeof runAppProcess = runAppProcess,
): Promise<number> {
  const source = await readRequiredFile(file, "source");
  assertAppScope(readDeclaredAppScope(source), profileAppScope(execution.profile), "data app file");
  const directory = fileDevRuntimeDirectory();
  await prepareFileDevRuntime(directory, run);
  const proxy = startAppDevProxy(execution);
  try {
    const exitCode = await run(["server.ts"], directory, {
      ...proxy.environment,
      ALTERTABLE_APP_FILE: file,
      PORT: port,
    });
    return exitCode === 0 ? 0 : EXIT_GENERIC;
  } finally {
    await proxy.stop();
  }
}

function runtimeFiles(): Record<string, string> {
  const starter = createAppFiles(dataAppPayload, {
    name: "altertable-file-dev",
    title: "File dev",
    scope: { organization: "local", environment: "local" },
  });
  return {
    "package.json": starter["package.json"]!,
    "bun.lock": starter["bun.lock"]!,
    "bunfig.toml": starter["bunfig.toml"]!,
    "server.ts": serverScript,
    "host.html": hostPage,
    "host.js": hostScript,
  };
}
