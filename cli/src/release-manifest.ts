export type ReleaseOperatingSystem = "darwin" | "linux";
export type ReleaseArchitecture = "arm64" | "x64";

export type ReleaseTarget = {
  bunTarget: `bun-${string}`;
  platform: `${ReleaseOperatingSystem}-${ReleaseArchitecture}`;
  os: ReleaseOperatingSystem;
  arch: ReleaseArchitecture;
  asset: `altertable-${string}`;
  runner: string;
};

/**
 * Single source of truth for native release binaries.
 *
 * Asset names are a public updater contract. Keep them stable unless the updater
 * supports both the old and new names during a migration.
 */
export const RELEASE_TARGETS = [
  {
    bunTarget: "bun-darwin-arm64",
    platform: "darwin-arm64",
    os: "darwin",
    arch: "arm64",
    asset: "altertable-darwin-arm64",
    runner: "macos-15",
  },
  {
    bunTarget: "bun-darwin-x64",
    platform: "darwin-x64",
    os: "darwin",
    arch: "x64",
    asset: "altertable-darwin-x64",
    runner: "macos-15-intel",
  },
  {
    bunTarget: "bun-linux-arm64",
    platform: "linux-arm64",
    os: "linux",
    arch: "arm64",
    asset: "altertable-linux-arm64",
    runner: "ubuntu-24.04-arm",
  },
  {
    bunTarget: "bun-linux-x64-baseline",
    platform: "linux-x64",
    os: "linux",
    arch: "x64",
    asset: "altertable-linux-x64",
    runner: "ubuntu-24.04",
  },
] as const satisfies readonly ReleaseTarget[];

export type ReleasePlatform = (typeof RELEASE_TARGETS)[number]["platform"];
export type ReleaseBunTarget = (typeof RELEASE_TARGETS)[number]["bunTarget"];
export type ReleaseAssetName = (typeof RELEASE_TARGETS)[number]["asset"];

export const RELEASE_PLATFORM_CONFIG: Readonly<
  Record<ReleasePlatform, { asset: ReleaseAssetName }>
> = Object.freeze(
  Object.fromEntries(
    RELEASE_TARGETS.map((target) => [target.platform, { asset: target.asset }]),
  ) as Record<ReleasePlatform, { asset: ReleaseAssetName }>,
);

export const RELEASE_BUNDLE_ASSET = "altertable-cli.js";
export const RELEASE_CHECKSUMS_ASSET = "checksums.txt";
export const RELEASE_METADATA_ASSET = "release-manifest.json";

export function findReleaseTargetByBunTarget(
  bunTarget: string,
): (typeof RELEASE_TARGETS)[number] | undefined {
  return RELEASE_TARGETS.find((target) => target.bunTarget === bunTarget);
}

export function findReleaseTargetByPlatform(
  platform: string,
): (typeof RELEASE_TARGETS)[number] | undefined {
  return RELEASE_TARGETS.find((target) => target.platform === platform);
}

export function releaseCiMatrix(): {
  include: Array<{ target: ReleaseBunTarget; artifact: ReleaseAssetName; runner: string }>;
} {
  return {
    include: RELEASE_TARGETS.map((target) => ({
      target: target.bunTarget,
      artifact: target.asset,
      runner: target.runner,
    })),
  };
}
