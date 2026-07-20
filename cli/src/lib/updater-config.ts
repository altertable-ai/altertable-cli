import { CLI_PACKAGE_METADATA } from "@/package-metadata.ts";
import {
  RELEASE_CHECKSUMS_ASSET,
  RELEASE_PLATFORM_CONFIG,
  type ReleasePlatform,
} from "@/release-manifest.ts";
import { objectKeys } from "@/lib/object.ts";

const DAILY_MS = 24 * 60 * 60 * 1000;
const EXECUTABLE_NAME = "altertable";

const UpdaterSourceConfig = {
  npm: {
    registryUrl: "https://registry.npmjs.org",
    packageBaseUrl: "https://www.npmjs.com/package",
  },
  github: {
    apiBaseUrl: "https://api.github.com/repos",
    webBaseUrl: "https://github.com",
  },
} as const;

const UpdaterIntervalsMs = {
  daily: DAILY_MS,
  weekly: 7 * DAILY_MS,
  never: Number.POSITIVE_INFINITY,
} as const;

const UpdaterInstallCommands = {
  bun: {
    command: "bun",
    argsBeforePackage: ["install", "-g"],
    globalBinArgs: ["pm", "bin", "-g"],
  },
  npm: {
    command: "npm",
    argsBeforePackage: ["install", "-g"],
    globalBinArgs: ["prefix", "-g"],
    globalBinIsPrefix: true,
  },
  pnpm: {
    command: "pnpm",
    argsBeforePackage: ["add", "-g"],
    globalBinArgs: ["bin", "-g"],
  },
  yarn: {
    command: "yarn",
    argsBeforePackage: ["global", "add"],
    globalBinArgs: ["global", "bin"],
  },
} as const;

export const UpdaterInstallMethod = {
  auto: "auto",
  packageManager: "package-manager",
  githubBinary: "github-binary",
} as const;

const UpdaterInstallMethodConfig = {
  [UpdaterInstallMethod.auto]: {},
  [UpdaterInstallMethod.packageManager]: {},
  [UpdaterInstallMethod.githubBinary]: {},
} as const;

export const UpdaterInstallationKind = {
  nativeBinary: "native-binary",
  packageManager: "package-manager",
  source: "source",
  unknown: "unknown",
} as const;

const UpdaterDefault = {
  source: "npm",
  checkInterval: "daily",
  installManager: "npm",
  installMethod: "auto",
} as const satisfies {
  source: keyof typeof UpdaterSourceConfig;
  checkInterval: keyof typeof UpdaterIntervalsMs;
  installManager: keyof typeof UpdaterInstallCommands;
  installMethod: keyof typeof UpdaterInstallMethodConfig;
};

export const UpdaterConfig = {
  packageName: CLI_PACKAGE_METADATA.name,
  githubRepo: CLI_PACKAGE_METADATA.repositorySlug,
  executableName: EXECUTABLE_NAME,
  stateFileName: "update-state.json",
  configKeys: {
    checkInterval: "update_check_interval",
  },
  defaults: UpdaterDefault,
  sources: UpdaterSourceConfig,
  timeoutsMs: {
    automatic: 900,
    manual: 10_000,
  },
  intervalsMs: UpdaterIntervalsMs,
  automaticCheckSkipCommands: ["completion", "doctor", "update", "upgrade"],
  installCommands: UpdaterInstallCommands,
  installMethods: UpdaterInstallMethodConfig,
  releasePlatforms: RELEASE_PLATFORM_CONFIG,
  installationKinds: UpdaterInstallationKind,
  binaryAssetPrefix: EXECUTABLE_NAME,
  checksumsAssetName: RELEASE_CHECKSUMS_ASSET,
  installationDetection: {
    sourceScriptSuffixes: ["/src/cli.ts"],
    sourceScriptExtensions: [".ts"],
    packageScriptSuffixes: ["/dist/cli.js"],
    packageScriptNames: ["cli.js"],
    packageScriptExtensions: [".js"],
    bunExecutableNames: ["bun"],
    bunExecutablePrefix: "bun-",
  },
  commands: {
    selfUpdate: "altertable update",
  },
} as const;

export type UpdateSource = keyof typeof UpdaterConfig.sources;
export type UpdateCheckInterval = keyof typeof UpdaterConfig.intervalsMs;
export type InstallManager = keyof typeof UpdaterConfig.installCommands;
export type UpdateInstallMethod = keyof typeof UpdaterConfig.installMethods;
export type ResolvedUpdateInstallMethod = Exclude<UpdateInstallMethod, "auto">;
export type { ReleasePlatform };
export type InstallationKind =
  (typeof UpdaterConfig.installationKinds)[keyof typeof UpdaterConfig.installationKinds];

export const UpdaterCheckIntervals = objectKeys(UpdaterConfig.intervalsMs);
