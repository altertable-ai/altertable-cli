import packageJson from "../package.json" with { type: "json" };

export type NpmVersionLookup = { status: "published"; version: string } | { status: "missing" };

export const MINIMUM_TRUSTED_PUBLISHING_NPM_VERSION = "11.5.1";

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) throw new Error(`Invalid npm version: ${version.trim() || "<empty>"}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function assertTrustedPublishingEnvironment(
  environment: Record<string, string | undefined>,
  npmVersion: string,
): void {
  if (environment.NODE_AUTH_TOKEN || environment.NPM_TOKEN) {
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

async function npmVersionLookup(specification: string): Promise<NpmVersionLookup> {
  const child = Bun.spawn(["npm", "view", specification, "version", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return parseNpmVersionLookup(exitCode, stdout, stderr);
}

async function publish(): Promise<void> {
  const versionProcess = Bun.spawn(["npm", "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [npmVersion, versionError, versionExitCode] = await Promise.all([
    new Response(versionProcess.stdout).text(),
    new Response(versionProcess.stderr).text(),
    versionProcess.exited,
  ]);
  if (versionExitCode !== 0) {
    throw new Error(
      `npm --version failed (${versionExitCode}): ${versionError.trim() || npmVersion.trim()}`,
    );
  }
  assertTrustedPublishingEnvironment(Bun.env, npmVersion);

  const child = Bun.spawn(["npm", "publish", "--access", "public"], {
    cwd: import.meta.dir + "/..",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`npm publish failed with exit code ${exitCode}.`);
  }
}

export async function publishNpmIfMissing(): Promise<void> {
  const specification = `${packageJson.name}@${packageJson.version}`;
  const lookup = await npmVersionLookup(specification);
  if (!npmPublicationRequired(lookup, packageJson.version)) {
    console.log(`${specification} is already published; continuing.`);
    return;
  }
  await publish();
}

if (import.meta.main) {
  await publishNpmIfMissing();
}
