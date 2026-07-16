import { RELEASE_TARGETS, type ReleaseAssetName } from "@/release-manifest.ts";

export { RELEASE_CHECKSUMS_ASSET, RELEASE_TARGETS } from "@/release-manifest.ts";
export type { ReleaseTarget } from "@/release-manifest.ts";

export const RELEASE_BUNDLE_ASSET = "altertable-cli.js";
export const RELEASE_METADATA_ASSET = "release-manifest.json";

type ReleaseBunTarget = (typeof RELEASE_TARGETS)[number]["bunTarget"];

export function findReleaseTargetByBunTarget(bunTarget: string) {
  return RELEASE_TARGETS.find((target) => target.bunTarget === bunTarget);
}

export function findReleaseTargetByPlatform(platform: string) {
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
