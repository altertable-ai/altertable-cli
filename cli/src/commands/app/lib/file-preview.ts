import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readDeclaredAppScope } from "@/commands/app/lib/declared-app.ts";
import { runAppPreview } from "@/commands/app/lib/dev-proxy.ts";
import { recommendedDataAppVersion } from "@/commands/app/lib/package.ts";
import { dataAppPayload } from "@/commands/app/lib/payload.ts";
import { readRequiredFile } from "@/commands/app/lib/remote.ts";
import { runAppProcess } from "@/commands/app/lib/run.ts";
import { assertAppScope, profileAppScope } from "@/commands/app/lib/scope.ts";
import { configDir } from "@/lib/config-files.ts";
import { CliError } from "@/lib/errors.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";

export const defaultFilePreviewPort = 25837;

export async function previewAppFile(
  file: string,
  port: number,
  execution: ExecutionContext,
  run: typeof runAppProcess = runAppProcess,
): Promise<number> {
  const source = await readRequiredFile(file, "source");
  assertAppScope(readDeclaredAppScope(source), profileAppScope(execution.profile), "data app file");
  const directory = join(configDir(), "data-app-dev", recommendedDataAppVersion());
  await prepareFilePreviewRuntime(directory, run);
  return runAppPreview(
    ["server.ts"],
    directory,
    execution,
    {
      ALTERTABLE_APP_FILE: file,
      PORT: String(port),
    },
    run,
  );
}

/** Reuse the starter's exact dependency pins and frozen lockfile without scaffolding an app. */
export async function prepareFilePreviewRuntime(
  directory: string,
  run: typeof runAppProcess = runAppProcess,
): Promise<void> {
  const { starter, filePreview } = dataAppPayload;
  const files = {
    "package.json": starter["package.json"]!,
    "bun.lock": starter["bun.lock"]!,
    "bunfig.toml": starter["bunfig.toml"]!,
    ...filePreview,
  };
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) => writeFile(join(directory, name), content)),
  );
  if ((await run(["install", "--frozen-lockfile", "--production"], directory)) !== 0) {
    throw new CliError("Could not install the data app package used to preview a single file.");
  }
}
