import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "@/lib/command.ts";
import { getLakehouseCredentialPair } from "@/lib/auth.ts";
import { resolveApiBase } from "@/lib/config.ts";
import { ConfigurationError, EXIT_GENERIC } from "@/lib/errors.ts";
import { copyProcessEnv } from "@/lib/env.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import {
  appDirectory,
  assertAppOutputMode,
  requireAppScripts,
  runAppCommand,
} from "@/commands/app/lib/run.ts";
import { currentRuntimeIntegrity, installedRuntimeIntegrity } from "@/commands/app/lib/runtime.ts";
import projectCheckScript from "@/commands/app/lib/project-check.js.txt";

type AppManifest = {
  schemaVersion: 1;
  title: string;
  appearance?: unknown;
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
    if ((await runAppCommand("install", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    if ((await runAppCommand("format:check", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    if ((await runAppCommand("lint", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    if ((await runAppCommand("typecheck", directory)) !== 0) return { exitCode: EXIT_GENERIC };
    await checkAppProject(directory);
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
      await checkAppProject(directory, {
        ALTERTABLE_API_BASE: resolveApiBase(execution.profile),
        ALTERTABLE_LAKEHOUSE_USERNAME: credentials.user,
        ALTERTABLE_LAKEHOUSE_PASSWORD: credentials.password,
      });
    }
    sink.writeHuman(
      `Checked ${manifest.title}: operation contracts and client bundle clean${args.lakehouse ? ", lakehouse operation checks passed" : ""}.`,
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
    !value.title.trim()
  ) {
    throw new ConfigurationError("app.json needs schemaVersion 1 and a title.");
  }
  return value as AppManifest;
}

/** Validate app-owned modules in Bun, outside the compiled CLI's module graph. */
export async function checkAppProject(
  directory: string,
  lakehouseEnvironment?: Record<string, string>,
): Promise<void> {
  const env = copyProcessEnv();
  for (const key of Object.keys(env)) {
    if (key.startsWith("ALTERTABLE_")) delete env[key];
  }
  Object.assign(env, lakehouseEnvironment);
  env.BUN_BE_BUN = "1";
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      projectCheckScript,
      lakehouseEnvironment ? "--lakehouse" : "--contract",
    ],
    { cwd: directory, env, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  if ((await child.exited) !== 0) {
    throw new ConfigurationError("Data app validation failed.");
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
