import { join } from "node:path";
import {
  RELEASE_BUNDLE_ASSET,
  RELEASE_CHECKSUMS_ASSET,
  RELEASE_METADATA_ASSET,
  RELEASE_TARGETS,
} from "@/release-manifest.ts";

const repositoryRoot = join(import.meta.dir, "../..");
const releaseDirectory = join(repositoryRoot, "dist");

export function githubReleaseUploadCommand(tag: string): string[] {
  return [
    "gh",
    "release",
    "upload",
    tag,
    ...RELEASE_TARGETS.map(({ asset }) => join(releaseDirectory, asset)),
    join(releaseDirectory, RELEASE_BUNDLE_ASSET),
    join(releaseDirectory, RELEASE_METADATA_ASSET),
    join(releaseDirectory, RELEASE_CHECKSUMS_ASSET),
    "--clobber",
  ];
}

export function githubReleasePublishCommand(tag: string): string[] {
  return ["gh", "release", "edit", tag, "--draft=false", "--latest"];
}

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, { cwd: repositoryRoot, stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
}

async function main(arguments_: string[]): Promise<void> {
  const command = arguments_[0];
  const tag = process.env.RELEASE_TAG?.trim();
  if (!tag) throw new Error("RELEASE_TAG is required.");
  if (command === "upload") {
    await run(githubReleaseUploadCommand(tag));
    return;
  }
  if (command === "publish") {
    await run(githubReleasePublishCommand(tag));
    return;
  }
  throw new Error("Usage: github-release.ts <upload|publish>");
}

if (import.meta.main) {
  await main(Bun.argv.slice(2));
}
