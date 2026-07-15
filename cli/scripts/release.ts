import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { buildNpmBundle, NPM_BUNDLE_OPTIONS, NPM_BUNDLE_PATH } from "@/../scripts/npm-bundle.ts";
import { VERSION } from "@/version.ts";
import {
  findReleaseTargetByBunTarget,
  findReleaseTargetByPlatform,
  RELEASE_BUNDLE_ASSET,
  RELEASE_CHECKSUMS_ASSET,
  RELEASE_METADATA_ASSET,
  RELEASE_TARGETS,
  releaseCiMatrix,
  type ReleaseTarget,
} from "@/release-manifest.ts";

export const RELEASE_MANIFEST_SCHEMA_VERSION = 2;
export const SUPPORTED_BUN_RUNTIME_RANGE = ">=1.1.0";

export const HARDENED_COMPILE_FLAGS = [
  "--compile",
  "--minify",
  "--bytecode",
  "--format=esm",
  "--sourcemap=inline",
  "--reject-unresolved",
  "--no-compile-autoload-dotenv",
  "--no-compile-autoload-bunfig",
] as const;

export { NPM_BUNDLE_OPTIONS as JAVASCRIPT_BUNDLE_OPTIONS };

const repositoryRoot = join(import.meta.dir, "../..");
const cliRoot = join(repositoryRoot, "cli");
const entrypoint = join(cliRoot, "src/cli.ts");
const defaultOutputDirectory = join(repositoryRoot, "dist");
const bunVersionFile = join(repositoryRoot, ".bun-version");

type PackageJson = typeof packageJson & {
  engines: { bun: string };
  packageManager: string;
};

export type ReleaseArtifact = {
  kind: "native" | "javascript";
  file: string;
  bytes: number;
  sha256: string;
  platform?: string;
  bunTarget?: string;
  recipe:
    | {
        builder: "bun-build-executable";
        bunVersion: string;
        target: string;
        flags: readonly string[];
      }
    | {
        builder: "bun-build";
        bunVersion: string;
        target: "bun";
        minify: boolean;
        sourcemap: "none";
      };
};

export type ReleaseMetadata = {
  schemaVersion: number;
  name: string;
  version: string;
  tag: string;
  toolchain: {
    bunVersion: string;
  };
  artifacts: ReleaseArtifact[];
};

export type ToolchainContract = {
  bunVersion: string;
  packageManager: string;
  enginesBun: string;
};

export const expectedReleaseTag = `v${VERSION}`;

export async function readToolchainContract(): Promise<ToolchainContract> {
  const manifest = packageJson as PackageJson;
  return {
    bunVersion: (await Bun.file(bunVersionFile).text()).trim(),
    packageManager: manifest.packageManager,
    enginesBun: manifest.engines.bun,
  };
}

export async function assertToolchain(actualBunVersion = Bun.version): Promise<ToolchainContract> {
  const contract = await readToolchainContract();
  const expectedPackageManager = `bun@${contract.bunVersion}`;

  if (contract.packageManager !== expectedPackageManager) {
    throw new Error(
      `packageManager must be ${expectedPackageManager}; received ${contract.packageManager}.`,
    );
  }
  if (contract.enginesBun !== SUPPORTED_BUN_RUNTIME_RANGE) {
    throw new Error(
      `engines.bun must preserve the supported runtime range ${SUPPORTED_BUN_RUNTIME_RANGE}; received ${contract.enginesBun}.`,
    );
  }
  if (actualBunVersion !== contract.bunVersion) {
    throw new Error(
      `Release builds require Bun ${contract.bunVersion}; received ${actualBunVersion}.`,
    );
  }
  if (packageJson.version !== VERSION) {
    throw new Error(
      `cli/package.json version (${packageJson.version}) must match cli/src/version.ts (${VERSION}).`,
    );
  }
  return contract;
}

export function assertReleaseTag(tag: string): void {
  if (tag !== expectedReleaseTag) {
    throw new Error(`Release tag must be ${expectedReleaseTag}; received ${tag}.`);
  }
}

export function compileCommand(target: ReleaseTarget, outputPath: string): string[] {
  return [
    process.execPath,
    "build",
    entrypoint,
    ...HARDENED_COMPILE_FLAGS,
    `--target=${target.bunTarget}`,
    `--outfile=${outputPath}`,
  ];
}

export function nativeReleaseTarget(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): (typeof RELEASE_TARGETS)[number] {
  const target = findReleaseTargetByPlatform(`${platform}-${architecture}`);
  if (!target) {
    throw new Error(`Unsupported native release platform: ${platform}-${architecture}.`);
  }
  return target;
}

export async function compileReleaseTarget(
  target: ReleaseTarget,
  outputDirectory = defaultOutputDirectory,
): Promise<string> {
  await assertToolchain();
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, target.asset);
  await run(compileCommand(target, outputPath));
  await assertNonemptyFile(outputPath);
  return outputPath;
}

export async function buildJavaScriptBundle(
  outputDirectory = defaultOutputDirectory,
): Promise<string> {
  await assertToolchain();
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, RELEASE_BUNDLE_ASSET);
  await buildNpmBundle();
  await copyFile(NPM_BUNDLE_PATH, outputPath);
  await assertNonemptyFile(outputPath);
  if ((await sha256(Bun.file(NPM_BUNDLE_PATH))) !== (await sha256(Bun.file(outputPath)))) {
    throw new Error("GitHub and npm JavaScript release bundles differ.");
  }
  return outputPath;
}

export async function buildAllReleaseArtifacts(
  options: {
    outputDirectory?: string;
    tag?: string;
  } = {},
): Promise<ReleaseMetadata> {
  await assertToolchain();
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory;
  const tag = options.tag ?? expectedReleaseTag;
  assertReleaseTag(tag);

  for (const target of RELEASE_TARGETS) {
    await compileReleaseTarget(target, outputDirectory);
  }
  await buildJavaScriptBundle(outputDirectory);
  return writeReleaseMetadata(outputDirectory, tag);
}

export async function writeReleaseMetadata(
  outputDirectory = defaultOutputDirectory,
  tag = expectedReleaseTag,
): Promise<ReleaseMetadata> {
  await assertToolchain();
  assertReleaseTag(tag);

  const nativeArtifacts = await Promise.all(
    RELEASE_TARGETS.map(async (target): Promise<ReleaseArtifact> => {
      const file = Bun.file(join(outputDirectory, target.asset));
      if (!(await file.exists()) || file.size === 0) {
        throw new Error(`Missing or empty release artifact: ${target.asset}.`);
      }
      return {
        kind: "native",
        file: target.asset,
        bytes: file.size,
        sha256: await sha256(file),
        platform: target.platform,
        bunTarget: target.bunTarget,
        recipe: {
          builder: "bun-build-executable",
          bunVersion: Bun.version,
          target: target.bunTarget,
          flags: HARDENED_COMPILE_FLAGS,
        },
      };
    }),
  );

  const bundle = Bun.file(join(outputDirectory, RELEASE_BUNDLE_ASSET));
  if (!(await bundle.exists()) || bundle.size === 0) {
    throw new Error(`Missing or empty release artifact: ${RELEASE_BUNDLE_ASSET}.`);
  }

  const metadata: ReleaseMetadata = {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    name: packageJson.name,
    version: VERSION,
    tag,
    toolchain: {
      bunVersion: Bun.version,
    },
    artifacts: [
      ...nativeArtifacts,
      {
        kind: "javascript",
        file: RELEASE_BUNDLE_ASSET,
        bytes: bundle.size,
        sha256: await sha256(bundle),
        recipe: {
          builder: "bun-build",
          bunVersion: Bun.version,
          ...NPM_BUNDLE_OPTIONS,
        },
      },
    ],
  };

  const metadataPath = join(outputDirectory, RELEASE_METADATA_ASSET);
  await writeAtomic(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  const checksumEntries = [
    ...metadata.artifacts.map((artifact) => ({ file: artifact.file, sha256: artifact.sha256 })),
    {
      file: RELEASE_METADATA_ASSET,
      sha256: await sha256(Bun.file(metadataPath)),
    },
  ].sort((left, right) => left.file.localeCompare(right.file));
  await writeAtomic(
    join(outputDirectory, RELEASE_CHECKSUMS_ASSET),
    `${checksumEntries.map((entry) => `${entry.sha256}  ${entry.file}`).join("\n")}\n`,
  );

  return metadata;
}

async function assertNonemptyFile(path: string): Promise<void> {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`Build did not produce a non-empty file: ${path}.`);
  }
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await Bun.write(temporaryPath, contents);
  await rename(temporaryPath, path);
}

async function sha256(file: Blob): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await file.arrayBuffer());
  return hasher.digest("hex");
}

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, {
    cwd: repositoryRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
}

async function runCapture(command: string[]): Promise<string> {
  const child = Bun.spawn(command, {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(child.stdout).text();
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
  return output;
}

export async function smokeReleaseTarget(
  target: ReleaseTarget,
  outputDirectory = defaultOutputDirectory,
): Promise<void> {
  const executable = join(outputDirectory, target.asset);
  await assertNonemptyFile(executable);
  const version = (await runCapture([executable, "--version"])).trim();
  if (version !== VERSION) {
    throw new Error(`${target.asset} reported version ${version}; expected ${VERSION}.`);
  }
  const help = await runCapture([executable, "--help"]);
  if (!help.includes("Altertable CLI") || !help.includes("Commands")) {
    throw new Error(`${target.asset} returned incomplete help output.`);
  }
  console.log(`Smoke-tested ${target.asset} (${target.platform}).`);
}

function optionValue(arguments_: string[], name: string): string | undefined {
  return arguments_.find((argument) => argument.startsWith(`${name}=`))?.slice(`${name}=`.length);
}

async function main(arguments_: string[]): Promise<void> {
  const command = arguments_[0];
  if (command === "matrix") {
    console.log(JSON.stringify(releaseCiMatrix()));
    return;
  }

  if (command === "verify") {
    await assertToolchain();
    const tag = optionValue(arguments_, "--tag");
    if (tag) {
      assertReleaseTag(tag);
    }
    console.log(`Release contract verified for Bun ${Bun.version} and ${expectedReleaseTag}.`);
    return;
  }

  if (command === "finalize") {
    const outputDirectory = optionValue(arguments_, "--output-dir") ?? defaultOutputDirectory;
    const metadata = await writeReleaseMetadata(
      outputDirectory,
      optionValue(arguments_, "--tag") ?? expectedReleaseTag,
    );
    console.log(`Finalized ${metadata.artifacts.length} release artifacts.`);
    return;
  }

  if (command === "smoke") {
    const requestedTarget = optionValue(arguments_, "--target");
    const target = requestedTarget ? findReleaseTargetByBunTarget(requestedTarget) : undefined;
    if (!target) {
      throw new Error(
        requestedTarget
          ? `Unsupported Bun release target: ${requestedTarget}.`
          : "smoke requires --target=<target>.",
      );
    }
    await smokeReleaseTarget(
      target,
      optionValue(arguments_, "--output-dir") ?? defaultOutputDirectory,
    );
    return;
  }

  if (command !== "build") {
    throw new Error(
      "Usage: release.ts <matrix|verify|build|finalize|smoke> [--native|--bundle|--all|--target=<target>]",
    );
  }

  const outputDirectory = optionValue(arguments_, "--output-dir") ?? defaultOutputDirectory;
  if (arguments_.includes("--all")) {
    const metadata = await buildAllReleaseArtifacts({
      outputDirectory,
      tag: optionValue(arguments_, "--tag"),
    });
    console.log(`Built and finalized ${metadata.artifacts.length} release artifacts.`);
    return;
  }

  if (arguments_.includes("--bundle")) {
    const outputPath = await buildJavaScriptBundle(outputDirectory);
    console.log(`Built ${outputPath} (Bun JavaScript bundle).`);
    return;
  }

  const requestedTarget = optionValue(arguments_, "--target");
  const target = requestedTarget
    ? findReleaseTargetByBunTarget(requestedTarget)
    : arguments_.includes("--native")
      ? nativeReleaseTarget()
      : undefined;
  if (!target) {
    throw new Error(
      requestedTarget
        ? `Unsupported Bun release target: ${requestedTarget}.`
        : "build requires --native, --bundle, --all, or --target=<target>.",
    );
  }

  const outputPath = await compileReleaseTarget(target, outputDirectory);
  console.log(`Built ${outputPath} (${target.bunTarget}).`);
}

if (import.meta.main) {
  await main(Bun.argv.slice(2));
}
