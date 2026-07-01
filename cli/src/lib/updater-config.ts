import { CLI_PACKAGE_METADATA } from "@/package-metadata.ts";
import { objectKeys } from "@/lib/object.ts";

const DAILY_MS = 24 * 60 * 60 * 1000;
const EXECUTABLE_NAME = "altertable";

const UPDATER_SOURCES = {
  npm: {
    registryUrl: "https://registry.npmjs.org",
    packageBaseUrl: "https://www.npmjs.com/package",
  },
  github: {
    apiBaseUrl: "https://api.github.com/repos",
    webBaseUrl: "https://github.com",
  },
} as const;

const UPDATE_INTERVALS_MS = {
  daily: DAILY_MS,
  weekly: 7 * DAILY_MS,
  never: Number.POSITIVE_INFINITY,
} as const;

const INSTALL_COMMANDS = {
  bun: { command: "bun", argsBeforePackage: ["install", "-g"] },
  npm: { command: "npm", argsBeforePackage: ["install", "-g"] },
  pnpm: { command: "pnpm", argsBeforePackage: ["add", "-g"] },
  yarn: { command: "yarn", argsBeforePackage: ["global", "add"] },
} as const;

export const UPDATE_INSTALL_METHOD = {
  auto: "auto",
  packageManager: "package-manager",
  githubBinary: "github-binary",
} as const;

const INSTALL_METHODS = {
  [UPDATE_INSTALL_METHOD.auto]: {},
  [UPDATE_INSTALL_METHOD.packageManager]: {},
  [UPDATE_INSTALL_METHOD.githubBinary]: {},
} as const;

const RELEASE_PLATFORMS = {
  "darwin-arm64": {},
  "darwin-x64": {},
  "linux-arm64": {},
  "linux-x64": {},
} as const;

export const INSTALLATION_KIND = {
  nativeBinary: "native-binary",
  packageManager: "package-manager",
  source: "source",
  unknown: "unknown",
} as const;

const UPDATER_DEFAULTS = {
  source: "npm",
  checkInterval: "daily",
  installManager: "npm",
  installMethod: "auto",
} as const satisfies {
  source: keyof typeof UPDATER_SOURCES;
  checkInterval: keyof typeof UPDATE_INTERVALS_MS;
  installManager: keyof typeof INSTALL_COMMANDS;
  installMethod: keyof typeof INSTALL_METHODS;
};

export const UPDATER_CONFIG = {
  packageName: CLI_PACKAGE_METADATA.name,
  githubRepo: CLI_PACKAGE_METADATA.repositorySlug,
  executableName: EXECUTABLE_NAME,
  stateFileName: "update-state.json",
  configKeys: {
    checkInterval: "update_check_interval",
  },
  defaults: UPDATER_DEFAULTS,
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
  sources: UPDATER_SOURCES,
  timeoutsMs: {
    automatic: 900,
    manual: 10_000,
  },
  intervalsMs: UPDATE_INTERVALS_MS,
  automaticCheckSkipCommands: ["completion", "update"],
  installCommands: INSTALL_COMMANDS,
  installMethods: INSTALL_METHODS,
  releasePlatforms: RELEASE_PLATFORMS,
  installationKinds: INSTALLATION_KIND,
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
    packageManagerUpdate: "altertable update --install --install-method package-manager",
  },
} as const;

export type UpdateSource = keyof typeof UPDATER_CONFIG.sources;
export type UpdateCheckInterval = keyof typeof UPDATER_CONFIG.intervalsMs;
export type InstallManager = keyof typeof UPDATER_CONFIG.installCommands;
export type UpdateInstallMethod = keyof typeof UPDATER_CONFIG.installMethods;
export type ResolvedUpdateInstallMethod = Exclude<UpdateInstallMethod, "auto">;
export type ReleasePlatform = keyof typeof UPDATER_CONFIG.releasePlatforms;
export type InstallationKind =
  (typeof UPDATER_CONFIG.installationKinds)[keyof typeof UPDATER_CONFIG.installationKinds];

export const UPDATE_SOURCES = objectKeys(UPDATER_CONFIG.sources);
export const UPDATE_CHECK_INTERVALS = objectKeys(UPDATER_CONFIG.intervalsMs);
export const INSTALL_MANAGERS = objectKeys(UPDATER_CONFIG.installCommands);
export const UPDATE_INSTALL_METHODS = objectKeys(UPDATER_CONFIG.installMethods);
