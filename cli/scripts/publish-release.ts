import { basename, join, resolve } from "node:path";

export type NpmVersionLookup = { status: "published"; version: string } | { status: "missing" };

export const MINIMUM_TRUSTED_PUBLISHING_NPM_VERSION = "11.5.1";
export const SETUP_NODE_AUTH_TOKEN_PLACEHOLDER = "XXXXX-XXXXX-XXXXX-XXXXX";
export const RELEASE_METADATA_FILE = "release-manifest.json";
export const RELEASE_CHECKSUMS_FILE = "checksums.txt";

type PackageIdentity = {
  name: string;
  version: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) throw new Error(`Invalid npm version: ${version.trim() || "<empty>"}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function assertTrustedPublishingEnvironment(
  environment: Record<string, string | undefined>,
  npmVersion: string,
): void {
  // setup-node exports this non-secret sentinel when registry-url is configured.
  const nodeAuthToken = environment.NODE_AUTH_TOKEN;
  const hasLongLivedNodeAuthToken =
    Boolean(nodeAuthToken) && nodeAuthToken !== SETUP_NODE_AUTH_TOKEN_PLACEHOLDER;
  if (hasLongLivedNodeAuthToken || environment.NPM_TOKEN) {
    throw new Error("npm publishing must use OIDC; remove long-lived npm publish tokens.");
  }
  if (!environment.ACTIONS_ID_TOKEN_REQUEST_URL || !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error(
      "npm trusted publishing requires GitHub Actions OIDC credentials (id-token: write).",
    );
  }

  const actual = parseVersion(npmVersion);
  const minimum = parseVersion(MINIMUM_TRUSTED_PUBLISHING_NPM_VERSION);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index]! > minimum[index]!) return;
    if (actual[index]! < minimum[index]!) {
      throw new Error(
        `npm trusted publishing requires npm >=${MINIMUM_TRUSTED_PUBLISHING_NPM_VERSION}; received ${npmVersion.trim()}.`,
      );
    }
  }
}

export function parseNpmVersionLookup(
  exitCode: number,
  stdout: string,
  stderr: string,
): NpmVersionLookup {
  if (exitCode === 0) {
    const version = JSON.parse(stdout) as unknown;
    if (typeof version !== "string") {
      throw new Error(`npm view returned an invalid version response: ${stdout.trim()}`);
    }
    return { status: "published", version };
  }
  if (/\bE404\b|404 Not Found/i.test(`${stdout}\n${stderr}`)) {
    return { status: "missing" };
  }
  throw new Error(`npm view failed (${exitCode}): ${stderr.trim() || stdout.trim()}`);
}

export function npmPublicationRequired(lookup: NpmVersionLookup, expectedVersion: string): boolean {
  if (lookup.status === "missing") return true;
  if (lookup.version !== expectedVersion) {
    throw new Error(`npm returned version ${lookup.version}; expected ${expectedVersion}.`);
  }
  return false;
}

export function parsePackageIdentity(value: unknown, releaseTag: string): PackageIdentity {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.version !== "string") {
    throw new Error("Release package.json must contain string name and version fields.");
  }
  if (releaseTag !== `v${value.version}`) {
    throw new Error(`Release tag ${releaseTag} does not match package version ${value.version}.`);
  }
  return { name: value.name, version: value.version };
}

export function releaseAssetNames(value: unknown, releaseTag: string): string[] {
  if (!isRecord(value) || value.tag !== releaseTag || !Array.isArray(value.artifacts)) {
    throw new Error(`Release metadata must describe ${releaseTag} and contain an artifact list.`);
  }

  const names = value.artifacts.map((artifact, index) => {
    if (!isRecord(artifact) || typeof artifact.file !== "string") {
      throw new Error(`Release metadata artifact ${index} is missing its file name.`);
    }
    if (
      artifact.file.length === 0 ||
      artifact.file.includes("\\") ||
      basename(artifact.file) !== artifact.file ||
      artifact.file === "." ||
      artifact.file === ".."
    ) {
      throw new Error(`Unsafe release asset name: ${artifact.file}.`);
    }
    return artifact.file;
  });
  const completeNames = [...names, RELEASE_METADATA_FILE, RELEASE_CHECKSUMS_FILE];
  if (new Set(completeNames).size !== completeNames.length) {
    throw new Error("Release metadata contains duplicate asset names.");
  }
  return completeNames;
}

export async function readReleaseAssetPaths(
  releaseDirectory: string,
  releaseTag: string,
): Promise<string[]> {
  const metadataPath = join(releaseDirectory, RELEASE_METADATA_FILE);
  const metadata = (await Bun.file(metadataPath).json()) as unknown;
  const paths = releaseAssetNames(metadata, releaseTag).map((name) => join(releaseDirectory, name));
  for (const path of paths) {
    const file = Bun.file(path);
    if (!(await file.exists()) || file.size === 0) {
      throw new Error(`Missing or empty release asset: ${path}.`);
    }
  }
  return paths;
}

export function githubReleaseUploadCommand(tag: string, assetPaths: string[]): string[] {
  return ["gh", "release", "upload", tag, ...assetPaths, "--clobber"];
}

export function githubReleasePublishCommand(tag: string): string[] {
  return ["gh", "release", "edit", tag, "--draft=false", "--latest"];
}

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
}

async function runCapture(
  command: string[],
  cwd: string,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function publishNpmIfMissing(releaseRoot: string, releaseTag: string): Promise<void> {
  const packageDirectory = join(releaseRoot, "cli");
  const packageIdentity = parsePackageIdentity(
    (await Bun.file(join(packageDirectory, "package.json")).json()) as unknown,
    releaseTag,
  );
  const npmVersionResult = await runCapture(["npm", "--version"], packageDirectory);
  if (npmVersionResult.exitCode !== 0) {
    throw new Error(
      `npm --version failed (${npmVersionResult.exitCode}): ${npmVersionResult.stderr.trim() || npmVersionResult.stdout.trim()}`,
    );
  }
  assertTrustedPublishingEnvironment(Bun.env, npmVersionResult.stdout);

  const specification = `${packageIdentity.name}@${packageIdentity.version}`;
  const lookupResult = await runCapture(
    ["npm", "view", specification, "version", "--json"],
    packageDirectory,
  );
  const lookup = parseNpmVersionLookup(
    lookupResult.exitCode,
    lookupResult.stdout,
    lookupResult.stderr,
  );
  if (!npmPublicationRequired(lookup, packageIdentity.version)) {
    console.log(`${specification} is already published; continuing.`);
    return;
  }
  await run(["npm", "publish", "--access", "public"], packageDirectory);
}

async function main(arguments_: string[]): Promise<void> {
  const command = arguments_[0];
  const releaseRoot = resolve(process.env.RELEASE_ROOT?.trim() || join(import.meta.dir, "../.."));
  const releaseTag = process.env.RELEASE_TAG?.trim();
  if (!releaseTag) throw new Error("RELEASE_TAG is required.");

  if (command === "upload-github") {
    const assetPaths = await readReleaseAssetPaths(join(releaseRoot, "dist"), releaseTag);
    await run(githubReleaseUploadCommand(releaseTag, assetPaths), releaseRoot);
    return;
  }
  if (command === "publish-npm") {
    await publishNpmIfMissing(releaseRoot, releaseTag);
    return;
  }
  if (command === "publish-github") {
    await run(githubReleasePublishCommand(releaseTag), releaseRoot);
    return;
  }
  throw new Error("Usage: publish-release.ts <upload-github|publish-npm|publish-github>");
}

if (import.meta.main) {
  await main(Bun.argv.slice(2));
}
