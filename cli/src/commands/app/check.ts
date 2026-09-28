import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineCommand } from "@/lib/command.ts";
import { getLakehouseCredentialPair } from "@/lib/auth.ts";
import { resolveApiBase } from "@/lib/config.ts";
import { CliError, ConfigurationError, EXIT_GENERIC } from "@/lib/errors.ts";
import { copyProcessEnv } from "@/lib/env.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import {
  appDirectory,
  assertAppOutputMode,
  requireAppScripts,
  runAppCommand,
} from "@/commands/app/lib/run.ts";
import {
  currentRuntimeIntegrity,
  installedRuntimeIntegrity,
  runtimePath,
} from "@/commands/app/lib/runtime.ts";

type AppManifest = {
  schemaVersion: 1;
  title: string;
  appearance?: unknown;
  operations: Record<string, unknown>;
};
type Operation = {
  input: (value: unknown) => unknown;
  output: (value: unknown) => unknown;
  run: (...args: unknown[]) => Promise<unknown>;
  policy: { maxQueryRows: number; maxDurationMs: number; maxResponseBytes?: number };
};

export const appCheckCommand = defineCommand({
  metadata: {
    name: "check",
    description:
      "Validate a data app's format, lint, types, contract, build, and client credential boundary.",
    examples: ["altertable app check", "altertable app check --lakehouse"],
  },
  args: {
    dir: { type: "string", description: "App directory (default: current directory)." },
    lakehouse: {
      type: "boolean",
      description: "Run each app.json operation against the selected lakehouse.",
    },
  },
  async run({ args, execution, runtime, sink }) {
    assertAppOutputMode(runtime.context.json, runtime.context.agent);
    const directory = appDirectory(args.dir);
    requireAppScripts(directory, ["format:check", "lint", "typecheck", "build"]);
    const manifest = await readManifest(directory);
    const installed = await installedRuntimeIntegrity(directory);
    const current = currentRuntimeIntegrity();
    if (
      installed.version !== current.version ||
      Object.entries(current.sha256).some(([name, checksum]) => installed.sha256[name] !== checksum)
    ) {
      throw new ConfigurationError(
        `Data app runtime ${installed.version} is outdated. Run altertable app upgrade.`,
      );
    }
    try {
      const { parseAppearance } = (await import(
        pathToFileURL(join(directory, runtimePath, "appearance.ts")).href
      )) as { parseAppearance: (value: unknown) => unknown };
      parseAppearance(manifest.appearance);
    } catch {
      throw new ConfigurationError("app.json has invalid appearance settings.");
    }
    if ((await runAppCommand("install", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    if ((await runAppCommand("format:check", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    if ((await runAppCommand("lint", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    if ((await runAppCommand("typecheck", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    const operations = await readOperations(directory);
    validateOperations(manifest, operations);
    if ((await runAppCommand("build", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    await checkClientBundle(directory);
    if (args.lakehouse) {
      const verified = await configureVerify(["lakehouse"], execution);
      if (!verified.verified.lakehouse)
        throw new ConfigurationError(
          verified.errors[0]?.message ?? "Lakehouse credentials verification failed.",
        );
      const credentials = getLakehouseCredentialPair(execution.profile);
      await checkClientBundle(directory, [credentials.password]);
      const runtimeModule = (await import(
        pathToFileURL(join(directory, ".altertable/runtime/server.ts")).href
      )) as {
        createDataHandler: (
          operations: Record<string, Operation>,
          authorize: (
            request: Request,
            operation: string,
          ) => Promise<{ lakehouse: unknown; canDiscloseSql: boolean }>,
        ) => (request: Request) => Promise<Response>;
      };
      const localModule = (await import(
        pathToFileURL(join(directory, ".altertable/runtime/local.ts")).href
      )) as {
        localLakehouse: (environment: Record<string, string>) => unknown;
      };
      const lakehouse = localModule.localLakehouse({
        ALTERTABLE_API_BASE: resolveApiBase(execution.profile),
        ALTERTABLE_LAKEHOUSE_USERNAME: credentials.user,
        ALTERTABLE_LAKEHOUSE_PASSWORD: credentials.password,
      });
      const handle = runtimeModule.createDataHandler(operations, async () => ({
        lakehouse,
        canDiscloseSql: true,
      }));
      for (const [name, input] of Object.entries(manifest.operations)) {
        const response = await handle(
          new Request(`http://localhost/api/data/${name}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          }),
        );
        if (!response.ok)
          throw new CliError(`Live check failed for operation "${name}" (${response.status}).`);
      }
    }
    sink.writeHuman(
      `Checked ${manifest.title}: ${Object.keys(operations).length} operations, client bundle clean${args.lakehouse ? ", lakehouse operations passed" : ""}.`,
    );
  },
});

export async function readManifest(directory: string): Promise<AppManifest> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(join(directory, "app.json"), "utf8"));
  } catch {
    throw new ConfigurationError(`Cannot read a valid app.json in ${directory}.`);
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("title" in value) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    !("operations" in value) ||
    typeof value.operations !== "object" ||
    value.operations === null ||
    Array.isArray(value.operations) ||
    !Object.keys(value.operations).length
  ) {
    throw new ConfigurationError(
      "app.json needs schemaVersion 1, a title, and operation default inputs.",
    );
  }
  return value as AppManifest;
}

async function readOperations(directory: string): Promise<Record<string, Operation>> {
  try {
    const path = join(directory, "src/operations.ts");
    let module: {
      operations?: Record<string, Operation>;
    };
    try {
      module = await import(pathToFileURL(path).href);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Cannot find package")) throw error;
      // Bun can retain a missing-package lookup from before the preceding install.
      // A fresh Bun process resolves the now-installed local runtime correctly.
      const temporary = await mkdtemp(join(tmpdir(), "altertable-app-operations-"));
      try {
        const output = join(temporary, "operations.js");
        const child = Bun.spawn(
          [
            process.execPath,
            "build",
            "--target=bun",
            "--packages=bundle",
            `--outfile=${output}`,
            path,
          ],
          {
            cwd: directory,
            env: { ...copyProcessEnv(), BUN_BE_BUN: "1" },
            stdout: "ignore",
            stderr: "ignore",
          },
        );
        if ((await child.exited) !== 0) throw error;
        const source = await readFile(output);
        module = await import(`data:text/javascript;base64,${source.toString("base64")}`);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
    if (module.operations && typeof module.operations === "object") return module.operations;
  } catch (error) {
    throw new ConfigurationError(
      `Cannot load src/operations.ts: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  throw new ConfigurationError("src/operations.ts must export operations.");
}

export function validateOperations(
  manifest: AppManifest,
  operations: Record<string, Operation>,
): void {
  const names = Object.keys(operations);
  if (
    names.length !== Object.keys(manifest.operations).length ||
    names.some((name) => !Object.hasOwn(manifest.operations, name))
  ) {
    throw new ConfigurationError("app.json operations must match src/operations.ts.");
  }
  for (const name of names) {
    const operation = operations[name];
    if (
      !/^[a-z][a-z0-9-]*$/.test(name) ||
      !operation ||
      typeof operation.input !== "function" ||
      typeof operation.output !== "function" ||
      typeof operation.run !== "function" ||
      !Number.isInteger(operation.policy?.maxQueryRows) ||
      operation.policy.maxQueryRows < 1 ||
      !Number.isInteger(operation.policy.maxDurationMs) ||
      operation.policy.maxDurationMs < 1 ||
      (operation.policy.maxResponseBytes !== undefined &&
        (!Number.isInteger(operation.policy.maxResponseBytes) ||
          operation.policy.maxResponseBytes < 1))
    ) {
      throw new ConfigurationError(`Operation "${name}" needs valid inputs, output, and limits.`);
    }
    try {
      operation.input(manifest.operations[name]);
    } catch {
      throw new ConfigurationError(`app.json has invalid default inputs for "${name}".`);
    }
  }
}

export async function checkClientBundle(directory: string, secrets: string[] = []): Promise<void> {
  const dist = join(directory, "dist");
  let files: string[];
  try {
    files = await readdir(dist);
  } catch {
    throw new ConfigurationError("Build did not create dist/.");
  }
  const clientScripts = files.filter((name) => /^index(?:-[\w]+)?\.js$/.test(name));
  if (!files.includes("index.html") || !clientScripts.length) {
    throw new ConfigurationError("Build needs dist/index.html and a client JavaScript bundle.");
  }
  const clientAssets: string[] = [];
  async function visit(path: string, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(join(path, entry.name), name);
      else if (entry.isFile() && name !== "server.js" && name !== "server.js.map")
        clientAssets.push(name);
    }
  }
  await visit(dist);
  for (const name of clientAssets) {
    const content = await readFile(join(dist, name), "utf8");
    if (
      /ALTERTABLE_(?:API_BASE|LAKEHOUSE_USERNAME|LAKEHOUSE_PASSWORD|BASIC_AUTH_TOKEN|API_KEY|DATA_PROXY_URL|DATA_PROXY_TOKEN)/.test(
        content,
      )
    ) {
      throw new ConfigurationError(
        `Client asset ${name} contains a credential environment reference.`,
      );
    }
    if (secrets.some((secret) => secret.length >= 8 && content.includes(secret))) {
      throw new ConfigurationError(`Client asset ${name} contains a lakehouse credential value.`);
    }
  }
}
