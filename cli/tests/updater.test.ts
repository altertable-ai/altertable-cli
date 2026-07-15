import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCommand } from "citty";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildMainCommand, resolveTopLevelCommandName } from "@/cli.ts";
import { CLI_PACKAGE_METADATA } from "@/package-metadata.ts";
import { VERSION } from "@/version.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { resolveProcessExecutablePath } from "@/lib/executable-path.ts";
import {
  checkForUpdate,
  compareVersions,
  createInstallPlan,
  detectCurrentInstallation,
  detectInstallManager,
  detectReleasePlatform,
  fetchGitHubBinaryRelease,
  fetchLatestRelease,
  getUpdateCheckInterval,
  installCliUpdate,
  installGitHubBinaryRelease,
  isNativeCompiledInstall,
  maybeShowUpdateNotice,
  packageReleaseUrl,
  parseChecksums,
  readUpdateState,
  recommendedInstallCommand,
  releaseAssetName,
  releaseUrlForSource,
  resolveCurrentExecutablePath,
  resolveUpdateSource,
  setUpdateCheckInterval,
  shouldRunAutomaticUpdateCheck,
  UpdaterCheckIntervals,
  UpdaterInstallMethods,
  UpdaterSources,
  UpdaterConfig,
  verifySha256,
} from "@/lib/updater.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

let testHome = "";
const packageJsonPath = resolve(import.meta.dir, "../package.json");
const UPDATE_TEST_VERSION = "1.2.3";
const LINUX_X64_ASSET = "altertable-linux-x64";
const LINUX_X64_DOWNLOAD_URL = `https://download.example/${LINUX_X64_ASSET}`;
const CHECKSUMS_DOWNLOAD_URL = "https://download.example/checksums.txt";

type CapturedCommandOutput = {
  stdout: string[];
  stderr: string[];
};

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-updater-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_UPDATE_REGISTRY_URL;
  delete process.env.ALTERTABLE_UPDATE_GITHUB_REPO;
  delete process.env.ALTERTABLE_NO_UPDATE_CHECK;
  delete process.env.ALTERTABLE_UPDATE_CHECK;
  delete process.env.ALTERTABLE_UPDATE_INSTALLER;
  delete process.env.ALTERTABLE_UPDATE_INSTALL_METHOD;
  delete process.env.CI;
  delete process.env.TEST;
});

function jsonFetch(data: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch;
}

function fetchInputUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function githubReleaseMetadata(version = UPDATE_TEST_VERSION): Record<string, unknown> {
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/altertable-ai/altertable-cli/releases/tag/v${version}`,
    assets: [
      {
        name: LINUX_X64_ASSET,
        browser_download_url: LINUX_X64_DOWNLOAD_URL,
      },
      {
        name: UpdaterConfig.checksumsAssetName,
        browser_download_url: CHECKSUMS_DOWNLOAD_URL,
      },
    ],
  };
}

function githubBinaryFetch(options: {
  binary: string;
  checksum: string;
  version?: string;
}): typeof fetch {
  const version = options.version ?? UPDATE_TEST_VERSION;
  return (async (url: string | URL | Request) => {
    const requestedUrl = fetchInputUrl(url);
    if (requestedUrl.includes(`/releases/tags/v${version}`)) {
      return new Response(JSON.stringify(githubReleaseMetadata(version)), { status: 200 });
    }
    if (requestedUrl === LINUX_X64_DOWNLOAD_URL) {
      return new Response(options.binary, { status: 200 });
    }
    if (requestedUrl === CHECKSUMS_DOWNLOAD_URL) {
      return new Response(`${options.checksum}  ${LINUX_X64_ASSET}\n`, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

async function runUpdateCommand(rawArgs: string[]): Promise<CapturedCommandOutput> {
  const output: CapturedCommandOutput = { stdout: [], stderr: [] };
  const runtime = createCliRuntime({ debug: false, json: false, agent: false });
  runtime.output.writeHuman = (text) => {
    output.stdout.push(text);
  };
  runtime.output.writeMetadata = (lines) => {
    output.stderr.push(...lines);
  };

  await runWithCliRuntime(runtime, async () => {
    await runCommand(buildMainCommand(), { rawArgs });
  });

  return output;
}

async function readPackageJson(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
}

function repositorySlugFromPackageJson(data: Record<string, unknown>): string {
  const repository = data.repository;
  if (typeof repository !== "object" || repository === null || !("url" in repository)) {
    return "";
  }
  const url = (repository as Record<string, unknown>).url;
  if (typeof url !== "string") {
    return "";
  }
  return url
    .replace(/^git\+/, "")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

describe("package metadata", () => {
  test("keeps updater package identity aligned with package.json", async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.name).toBe(CLI_PACKAGE_METADATA.name);
    expect(repositorySlugFromPackageJson(packageJson)).toBe(CLI_PACKAGE_METADATA.repositorySlug);
    expect(UpdaterConfig.packageName).toBe(CLI_PACKAGE_METADATA.name);
    expect(UpdaterConfig.githubRepo).toBe(CLI_PACKAGE_METADATA.repositorySlug);
  });
});

describe("version comparison", () => {
  test("orders stable and prerelease versions", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.2.0-beta.1")).toBe(1);
    expect(compareVersions("1.2.0-beta.2", "1.2.0-beta.10")).toBe(-1);
  });
});

describe("release discovery", () => {
  test("builds package URLs and install specs from updater config", () => {
    expect(packageReleaseUrl(`v${UPDATE_TEST_VERSION}`)).toBe(
      `${UpdaterConfig.sources.npm.packageBaseUrl}/${encodeURIComponent(
        UpdaterConfig.packageName,
      )}/v/${UPDATE_TEST_VERSION}`,
    );
    expect(createInstallPlan(UPDATE_TEST_VERSION, "npm").display).toBe(
      `npm install -g ${UpdaterConfig.packageName}@${UPDATE_TEST_VERSION}`,
    );
  });

  test("builds source-aware release URLs for explicit target versions", () => {
    expect(releaseUrlForSource("npm", `v${UPDATE_TEST_VERSION}`)).toBe(
      `${UpdaterConfig.sources.npm.packageBaseUrl}/${encodeURIComponent(
        UpdaterConfig.packageName,
      )}/v/${UPDATE_TEST_VERSION}`,
    );
    expect(releaseUrlForSource("github", `v${UPDATE_TEST_VERSION}`)).toBe(
      `${UpdaterConfig.sources.github.webBaseUrl}/${UpdaterConfig.githubRepo}/releases/tag/v${UPDATE_TEST_VERSION}`,
    );
  });

  test("builds release metadata URLs from configured bases", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrls.push(fetchInputUrl(url));
      return new Response(JSON.stringify({ version: UPDATE_TEST_VERSION }), { status: 200 });
    }) as typeof fetch;

    process.env.ALTERTABLE_UPDATE_REGISTRY_URL = "https://registry.example.test/custom/";
    await fetchLatestRelease({ source: "npm", fetchImpl });

    expect(requestedUrls[0]).toBe(
      `https://registry.example.test/custom/${encodeURIComponent(
        UpdaterConfig.packageName,
      )}/latest`,
    );
  });

  test("builds GitHub release URL from configured repository", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrls.push(fetchInputUrl(url));
      return new Response(JSON.stringify({ tag_name: `v${UPDATE_TEST_VERSION}` }), {
        status: 200,
      });
    }) as typeof fetch;

    process.env.ALTERTABLE_UPDATE_GITHUB_REPO = "example/custom-cli";
    const release = await fetchLatestRelease({ source: "github", fetchImpl });

    expect(requestedUrls[0]).toBe(
      `${UpdaterConfig.sources.github.apiBaseUrl}/example/custom-cli/releases/latest`,
    );
    expect(release.releaseUrl).toBe(
      `${UpdaterConfig.sources.github.webBaseUrl}/${UpdaterConfig.githubRepo}/releases`,
    );
  });

  test("reads npm latest metadata", async () => {
    const release = await fetchLatestRelease({
      source: "npm",
      fetchImpl: jsonFetch({ version: UPDATE_TEST_VERSION }),
    });

    expect(release).toEqual({
      version: UPDATE_TEST_VERSION,
      source: "npm",
      releaseUrl: `https://www.npmjs.com/package/%40altertable%2Fcli/v/${UPDATE_TEST_VERSION}`,
    });
  });

  test("reads GitHub latest release metadata", async () => {
    const release = await fetchLatestRelease({
      source: "github",
      fetchImpl: jsonFetch(githubReleaseMetadata()),
    });

    expect(release.version).toBe(UPDATE_TEST_VERSION);
    expect(release.source).toBe("github");
    expect(release.releaseUrl).toContain(`releases/tag/v${UPDATE_TEST_VERSION}`);
  });

  test("explains missing npm release metadata", async () => {
    try {
      await fetchLatestRelease({
        source: "npm",
        fetchImpl: (async () =>
          new Response("missing", { status: 404 })) as unknown as typeof fetch,
      });
      throw new Error("Expected missing npm metadata to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        `No published npm release found for ${UpdaterConfig.packageName}.`,
      );
      expect((error as { details?: string }).details).toContain(
        "Try GitHub releases instead: altertable update --source github",
      );
      expect((error as { details?: string }).details).toContain(
        "If you are running from a source checkout, update it with git pull.",
      );
    }
  });

  test("explains missing GitHub release metadata", async () => {
    try {
      await fetchLatestRelease({
        source: "github",
        fetchImpl: (async () =>
          new Response("missing", { status: 404 })) as unknown as typeof fetch,
      });
      throw new Error("Expected missing GitHub metadata to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("No GitHub release metadata found for latest.");
      expect((error as { details?: string }).details).toContain("Open releases:");
    }
  });

  test("checkForUpdate writes cached state", async () => {
    const result = await checkForUpdate({
      source: "npm",
      fetchImpl: jsonFetch({ version: UPDATE_TEST_VERSION }),
    });

    expect(result.update_available).toBe(true);
    expect(readUpdateState().latest_version).toBe(UPDATE_TEST_VERSION);
  });
});

describe("binary self-update", () => {
  test("detects supported release platforms", () => {
    expect(detectReleasePlatform("darwin", "arm64")).toBe("darwin-arm64");
    expect(detectReleasePlatform("darwin", "x64")).toBe("darwin-x64");
    expect(detectReleasePlatform("linux", "arm64")).toBe("linux-arm64");
    expect(detectReleasePlatform("linux", "x64")).toBe("linux-x64");
    expect(() => detectReleasePlatform("win32", "x64")).toThrow("Unsupported self-update platform");
  });

  test("detects installation origin", () => {
    expect(
      detectCurrentInstallation({
        execPath: "/opt/homebrew/bin/bun",
        argv: ["bun", "/repo/cli/src/cli.ts"],
      }).kind,
    ).toBe("source");
    expect(
      detectCurrentInstallation({
        execPath: "/usr/local/bin/bun",
        argv: ["bun", "/usr/local/lib/node_modules/@altertable/cli/dist/cli.js"],
      }).kind,
    ).toBe("package-manager");
    expect(
      detectCurrentInstallation({
        execPath: "/usr/local/bin/altertable",
        argv: ["/usr/local/bin/altertable"],
      }).kind,
    ).toBe("native-binary");
    expect(
      isNativeCompiledInstall("/usr/local/bin/altertable", ["/usr/local/bin/altertable"]),
    ).toBe(true);
    expect(resolveCurrentExecutablePath()).toBeTruthy();
  });

  test("resolves relative compiled executable paths from the original invocation", () => {
    const executable = join(testHome, "bin", "altertable");
    mkdirSync(join(testHome, "bin"), { recursive: true });
    writeFileSync(executable, "binary");

    expect(
      resolveProcessExecutablePath({
        execPath: "altertable",
        argv0: executable,
        cwd: join(testHome, "elsewhere"),
        path: "",
      }),
    ).toBe(realpathSync(executable));
  });

  test("resolves bare compiled executable names from PATH", () => {
    const binDirectory = join(testHome, "bin");
    const executable = join(binDirectory, "altertable");
    mkdirSync(binDirectory, { recursive: true });
    writeFileSync(executable, "binary");

    expect(
      resolveProcessExecutablePath({
        execPath: "altertable",
        argv0: "altertable",
        cwd: join(testHome, "elsewhere"),
        path: binDirectory,
      }),
    ).toBe(realpathSync(executable));
  });

  test("recommends install commands from installation origin", () => {
    process.env.ALTERTABLE_UPDATE_INSTALLER = "npm";
    expect(
      recommendedInstallCommand(UPDATE_TEST_VERSION, {
        kind: "native-binary",
        executablePath: "/usr/local/bin/altertable",
      }),
    ).toBe("altertable update --install");
    expect(
      recommendedInstallCommand(UPDATE_TEST_VERSION, {
        kind: "package-manager",
        executablePath: "/usr/local/lib/node_modules/@altertable/cli/dist/cli.js",
      }),
    ).toBe(`npm install -g ${UpdaterConfig.packageName}@${UPDATE_TEST_VERSION}`);
    expect(
      recommendedInstallCommand(UPDATE_TEST_VERSION, {
        kind: "source",
        executablePath: "/repo/cli/src/cli.ts",
      }),
    ).toBe("altertable update --install");
    expect(
      recommendedInstallCommand(UPDATE_TEST_VERSION, {
        kind: "unknown",
        executablePath: "/custom/altertable",
      }),
    ).toBe("altertable update --install");
  });

  test("parses and verifies SHA-256 checksums", () => {
    const filePath = join(testHome, "asset");
    writeFileSync(filePath, "release-binary");
    const hash = sha256("release-binary");

    expect(parseChecksums(`${hash}  altertable-linux-x64\n`).get("altertable-linux-x64")).toBe(
      hash,
    );
    expect(verifySha256(filePath, hash)).toBe(true);
    expect(verifySha256(filePath, "0".repeat(64))).toBe(false);
  });

  test("reads GitHub binary release assets", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrls.push(fetchInputUrl(url));
      return new Response(JSON.stringify(githubReleaseMetadata()), { status: 200 });
    }) as typeof fetch;

    const release = await fetchGitHubBinaryRelease({
      version: UPDATE_TEST_VERSION,
      platform: "linux-x64",
      fetchImpl,
    });

    expect(requestedUrls[0]).toContain(`/releases/tags/v${UPDATE_TEST_VERSION}`);
    expect(release.assetName).toBe(releaseAssetName("linux-x64"));
    expect(release.assetDownloadUrl).toBe(LINUX_X64_DOWNLOAD_URL);
  });

  test("installs a GitHub binary after checksum verification and verifies version", async () => {
    const targetPath = join(testHome, "altertable");
    const newBinary = `#!/bin/sh\necho ${UPDATE_TEST_VERSION}\n`;
    const hash = sha256(newBinary);
    writeFileSync(targetPath, "#!/bin/sh\necho 1.0.0\n", { mode: 0o755 });

    const result = await installGitHubBinaryRelease(UPDATE_TEST_VERSION, {
      targetPath,
      platform: "linux-x64",
      fetchImpl: githubBinaryFetch({ binary: newBinary, checksum: hash }),
    });

    expect(result.method).toBe("github-binary");
    expect(result.verified_version).toBe(UPDATE_TEST_VERSION);
    expect(readFileSync(targetPath, "utf8")).toBe(newBinary);
  });

  test("rejects GitHub binary install on checksum mismatch without replacing target", async () => {
    const targetPath = join(testHome, "altertable");
    const originalBinary = "#!/bin/sh\necho 1.0.0\n";
    writeFileSync(targetPath, originalBinary, { mode: 0o755 });

    try {
      await installGitHubBinaryRelease(UPDATE_TEST_VERSION, {
        targetPath,
        platform: "linux-x64",
        fetchImpl: githubBinaryFetch({
          binary: `#!/bin/sh\necho ${UPDATE_TEST_VERSION}\n`,
          checksum: "0".repeat(64),
        }),
      });
      throw new Error("Expected checksum verification to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Checksum verification failed");
    }
    expect(readFileSync(targetPath, "utf8")).toBe(originalBinary);
  });

  test("verifies a downloaded GitHub binary before replacing the target", async () => {
    const targetPath = join(testHome, "altertable");
    const originalBinary = "#!/bin/sh\necho 1.0.0\n";
    const unexpectedBinary = "#!/bin/sh\necho 9.9.9\n";
    writeFileSync(targetPath, originalBinary, { mode: 0o755 });

    try {
      await installGitHubBinaryRelease(UPDATE_TEST_VERSION, {
        targetPath,
        platform: "linux-x64",
        fetchImpl: githubBinaryFetch({
          binary: unexpectedBinary,
          checksum: sha256(unexpectedBinary),
        }),
      });
      throw new Error("Expected downloaded binary verification to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Downloaded altertable version is 9.9.9");
    }
    expect(readFileSync(targetPath, "utf8")).toBe(originalBinary);
  });

  test("auto install uses the package manager for source checkouts", async () => {
    process.env.ALTERTABLE_UPDATE_INSTALLER = "npm";
    const commands: string[] = [];
    const result = await installCliUpdate(UPDATE_TEST_VERSION, {
      verify: false,
      stdio: "pipe",
      installation: {
        kind: "source",
        executablePath: "/repo/cli/src/cli.ts",
        reason: "test",
      },
      spawnImpl: ((command: string, args: string[]) => {
        commands.push([command, ...args].join(" "));
        return { status: 0, signal: null, stdout: "", stderr: "", pid: 1, output: [] };
      }) as unknown as typeof import("node:child_process").spawnSync,
    });

    expect(commands[0]).toBe(`npm install -g ${UpdaterConfig.packageName}@${UPDATE_TEST_VERSION}`);
    expect(result.method).toBe("package-manager");
  });
});

describe("automatic update checks", () => {
  test("resolves top-level commands with root value flags", () => {
    expect(resolveTopLevelCommandName(["--profile", "dev", "context"])).toBe("context");
    expect(resolveTopLevelCommandName(["--connect-timeout", "3", "context"])).toBe("context");
    expect(resolveTopLevelCommandName(["--read-timeout=10", "context"])).toBe("context");
    expect(resolveTopLevelCommandName(["--", "context"])).toBeUndefined();
  });

  test("requires human stderr and skips JSON output", () => {
    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        commandName: "context",
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(true);

    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: true, agent: false },
        commandName: "context",
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(false);

    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        commandName: "context",
        state: {},
        stderrIsTTY: false,
      }),
    ).toBe(false);
  });

  test("honors interval policy and environment opt-out", () => {
    setUpdateCheckInterval("never");
    expect(getUpdateCheckInterval()).toBe("never");
    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        commandName: "context",
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(false);

    setUpdateCheckInterval("daily");
    process.env.ALTERTABLE_NO_UPDATE_CHECK = "1";
    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        commandName: "context",
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(false);
  });

  test("skips commands configured for automatic update checks", () => {
    for (const commandName of UpdaterConfig.automaticCheckSkipCommands) {
      expect(
        shouldRunAutomaticUpdateCheck({
          context: { debug: false, json: false, agent: false },
          commandName,
          state: {},
          stderrIsTTY: true,
        }),
      ).toBe(false);
    }
  });

  test("detects package manager from environment", () => {
    expect(detectInstallManager({ npm_config_user_agent: "pnpm/9.0.0 npm/? node/?" })).toBe("pnpm");
    expect(detectInstallManager({ BUN_INSTALL: "/tmp/bun" })).toBe("bun");
    expect(detectInstallManager({ ALTERTABLE_UPDATE_INSTALLER: "yarn" })).toBe("yarn");
    expect(() => detectInstallManager({ ALTERTABLE_UPDATE_INSTALLER: "invalid" })).toThrow(
      ConfigurationError,
    );
  });

  test("does not reject when failure state persistence is unavailable", async () => {
    mkdirSync(join(testHome, UpdaterConfig.stateFileName));

    await maybeShowUpdateNotice({
      context: { debug: false, json: false, agent: false },
      commandName: "context",
      stderrIsTTY: true,
      fetchImpl: (async () => {
        throw new Error("network unavailable");
      }) as unknown as typeof fetch,
    });
  });

  test("does not reject when automatic check policy cannot read config", async () => {
    const invalidConfigHome = join(testHome, "not-a-directory");
    writeFileSync(invalidConfigHome, "");
    process.env.ALTERTABLE_CONFIG_HOME = invalidConfigHome;

    await maybeShowUpdateNotice({
      context: { debug: false, json: false, agent: false },
      commandName: "context",
      stderrIsTTY: true,
      fetchImpl: jsonFetch({ version: UPDATE_TEST_VERSION }),
    });
  });

  test("writes automatic notices to metadata output", async () => {
    const stderr: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeMetadata = (lines) => {
      stderr.push(...lines);
    };

    await runWithCliRuntime(runtime, async () => {
      await maybeShowUpdateNotice({
        context: { debug: false, json: false, agent: false },
        commandName: "context",
        stderrIsTTY: true,
        fetchImpl: jsonFetch({ version: UPDATE_TEST_VERSION }),
      });
    });

    expect(stderr.join("\n")).toContain(`Update available: altertable ${UPDATE_TEST_VERSION}`);
    expect(stderr.join("\n")).toContain("altertable update --install");
  });

  test("writes cached update notices without refreshing release metadata", async () => {
    await checkForUpdate({ fetchImpl: jsonFetch({ version: UPDATE_TEST_VERSION }) });
    const stderr: string[] = [];
    let fetchCalls = 0;

    await maybeShowUpdateNotice({
      context: { debug: false, json: false, agent: false },
      commandName: "help",
      stderrIsTTY: true,
      fetchImpl: (async () => {
        fetchCalls += 1;
        throw new Error("cached notices should not fetch");
      }) as unknown as typeof fetch,
      sink: {
        json: false,
        debug: false,
        writeStderr() {},
        writeJson() {},
        writeRaw() {},
        writeHuman() {},
        writeMetadata(lines) {
          stderr.push(...lines);
        },
      },
    });

    expect(fetchCalls).toBe(0);
    expect(stderr.join("\n")).toContain(`Update available: altertable ${UPDATE_TEST_VERSION}`);
  });

  test("falls back to a cached notice when a scheduled refresh fails", async () => {
    await checkForUpdate({ fetchImpl: jsonFetch({ version: UPDATE_TEST_VERSION }) });
    const state = readUpdateState();
    const stderr: string[] = [];

    await maybeShowUpdateNotice({
      context: { debug: false, json: false, agent: false },
      commandName: "context",
      stderrIsTTY: true,
      now: new Date(Date.parse(state.last_checked_at ?? "") + 24 * 60 * 60 * 1000),
      fetchImpl: (async () => {
        throw new Error("network unavailable");
      }) as unknown as typeof fetch,
      sink: {
        json: false,
        debug: false,
        writeStderr() {},
        writeJson() {},
        writeRaw() {},
        writeHuman() {},
        writeMetadata(lines) {
          stderr.push(...lines);
        },
      },
    });

    expect(stderr.join("\n")).toContain(`Update available: altertable ${UPDATE_TEST_VERSION}`);
    expect(readUpdateState().last_error).toBe("Unable to check for CLI updates.");
  });
});

describe("update command", () => {
  test("reports explicit target version without network", async () => {
    const output = await runUpdateCommand(["update", "--target-version", UPDATE_TEST_VERSION]);

    expect(output.stdout[0]).toBe(
      [
        `A new version of altertable is available: v${UPDATE_TEST_VERSION} (current v${VERSION})`,
        `Run ${UpdaterConfig.commands.selfUpdate} to install it.`,
      ].join("\n"),
    );
    expect(output.stdout[0]).not.toContain("Install:");
    expect(output.stdout[0]).not.toContain("Release:");
  });

  test("reports an explicit target that is already installed", async () => {
    const output = await runUpdateCommand(["update", "--target-version", VERSION]);

    expect(output.stdout[0]).toBe(`Target version v${VERSION} is already installed.`);
  });

  test("reports an explicit target that is older than the installed version", async () => {
    const targetVersion = "1.1.0";
    const output = await runUpdateCommand(["update", "--target-version", targetVersion]);

    expect(output.stdout[0]).toBe(
      [
        `Target version v${targetVersion} is older than installed altertable v${VERSION}.`,
        `Run altertable update --install --target-version ${targetVersion} --force to install it anyway.`,
      ].join("\n"),
    );
  });

  test("rejects unexpected positional arguments", () => {
    return expect(
      runUpdateCommand(["update", "install", "--target-version", "1.1.0"]),
    ).rejects.toThrow("Unexpected argument for altertable update: install.");
  });

  test("clear-cache forces a fresh update check", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jsonFetch({ version: UPDATE_TEST_VERSION });
    try {
      const output = await runUpdateCommand(["update", "--clear-cache"]);

      expect(output.stdout[0]).toContain(
        `A new version of altertable is available: v${UPDATE_TEST_VERSION}`,
      );
      expect(readUpdateState().latest_version).toBe(UPDATE_TEST_VERSION);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("configures automatic check interval", async () => {
    const output = await runUpdateCommand(["update", "--check-interval", "weekly"]);

    expect(output.stdout[0]).toContain("Auto update checks: weekly");
    expect(getUpdateCheckInterval()).toBe("weekly");
  });

  test("accepts every configured update source option", async () => {
    for (const source of UpdaterSources) {
      const output = await runUpdateCommand([
        "update",
        "--source",
        source,
        "--target-version",
        UPDATE_TEST_VERSION,
      ]);

      expect(output.stdout[0]).toBe(
        [
          `A new version of altertable is available: v${UPDATE_TEST_VERSION} (current v${VERSION})`,
          `Run ${UpdaterConfig.commands.selfUpdate} to install it.`,
        ].join("\n"),
      );
    }
  });

  test("accepts every configured automatic check interval option", async () => {
    for (const interval of UpdaterCheckIntervals) {
      const output = await runUpdateCommand(["update", "--check-interval", interval]);

      expect(output.stdout[0]).toContain(`Auto update checks: ${interval}`);
      expect(getUpdateCheckInterval()).toBe(interval);
    }
  });

  test("exposes every configured install method option", () => {
    expect(UpdaterInstallMethods).toContain("auto");
    expect(UpdaterInstallMethods).toContain("package-manager");
    expect(UpdaterInstallMethods).toContain("github-binary");
  });

  test("rejects an invalid source environment override", () => {
    process.env.ALTERTABLE_UPDATE_SOURCE = "invalid";

    expect(() => resolveUpdateSource()).toThrow(ConfigurationError);
  });
});
