import { CLI_PACKAGE_METADATA } from "@/package-metadata.ts";
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
  bun: { command: "bun", argsBeforePackage: ["install", "-g"] },
  npm: { command: "npm", argsBeforePackage: ["install", "-g"] },
  pnpm: { command: "pnpm", argsBeforePackage: ["add", "-g"] },
  yarn: { command: "yarn", argsBeforePackage: ["global", "add"] },
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

const UpdaterReleasePlatforms = {
  "darwin-arm64": {},
  "darwin-x64": {},
  "linux-arm64": {},
  "linux-x64": {},
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
  env: {
    source: "ALTERTABLE_UPDATE_SOURCE",
    registryUrl: "ALTERTABLE_UPDATE_REGISTRY_URL",
    githubRepo: "ALTERTABLE_UPDATE_GITHUB_REPO",
    installer: "ALTERTABLE_UPDATE_INSTALLER",
    installMethod: "ALTERTABLE_UPDATE_INSTALL_METHOD",
    noUpdateCheck: "ALTERTABLE_NO_UPDATE_CHECK",
    updateCheck: "ALTERTABLE_UPDATE_CHECK",
    bunInstall: "BUN_INSTALL",
    ci: "CI",
    test: "TEST",
  },
  sources: UpdaterSourceConfig,
  timeoutsMs: {
    automatic: 900,
    manual: 10_000,
  },
  intervalsMs: UpdaterIntervalsMs,
  automaticCheckSkipCommands: ["completion", "update"],
  installCommands: UpdaterInstallCommands,
  installMethods: UpdaterInstallMethodConfig,
  releasePlatforms: UpdaterReleasePlatforms,
  installationKinds: UpdaterInstallationKind,
  binaryAssetPrefix: EXECUTABLE_NAME,
  checksumsAssetName: "checksums.txt",
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
    selfUpdate: "altertable update --install",
  },
} as const;

export type UpdateSource = keyof typeof UpdaterConfig.sources;
export type UpdateCheckInterval = keyof typeof UpdaterConfig.intervalsMs;
export type InstallManager = keyof typeof UpdaterConfig.installCommands;
export type UpdateInstallMethod = keyof typeof UpdaterConfig.installMethods;
export type ResolvedUpdateInstallMethod = Exclude<UpdateInstallMethod, "auto">;
export type ReleasePlatform = keyof typeof UpdaterConfig.releasePlatforms;
export type InstallationKind =
  (typeof UpdaterConfig.installationKinds)[keyof typeof UpdaterConfig.installationKinds];

export const UpdaterSources = objectKeys(UpdaterConfig.sources);
export const UpdaterCheckIntervals = objectKeys(UpdaterConfig.intervalsMs);
export const UpdaterInstallManagers = objectKeys(UpdaterConfig.installCommands);
export const UpdaterInstallMethods = objectKeys(UpdaterConfig.installMethods);
