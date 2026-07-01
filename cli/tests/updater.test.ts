import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCommand } from "citty";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildMainCommand, resolveTopLevelCommandName } from "@/cli.ts";
import { CLI_PACKAGE_METADATA } from "@/package-metadata.ts";
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
  UPDATE_CHECK_INTERVALS,
  UPDATE_INSTALL_METHODS,
  UPDATE_SOURCES,
  UPDATER_CONFIG,
  verifySha256,
} from "@/lib/updater.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

let testHome = "";
const packageJsonPath = resolve(import.meta.dir, "../package.json");

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
    expect(UPDATER_CONFIG.packageName).toBe(CLI_PACKAGE_METADATA.name);
    expect(UPDATER_CONFIG.githubRepo).toBe(CLI_PACKAGE_METADATA.repositorySlug);
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
    expect(packageReleaseUrl("v1.2.3")).toBe(
      `${UPDATER_CONFIG.sources.npm.packageBaseUrl}/${encodeURIComponent(
        UPDATER_CONFIG.packageName,
      )}/v/1.2.3`,
    );
    expect(createInstallPlan("1.2.3", "npm").display).toBe(
      `npm install -g ${UPDATER_CONFIG.packageName}@1.2.3`,
    );
  });

  test("builds source-aware release URLs for explicit target versions", () => {
    expect(releaseUrlForSource("npm", "v1.2.3")).toBe(
      `${UPDATER_CONFIG.sources.npm.packageBaseUrl}/${encodeURIComponent(
        UPDATER_CONFIG.packageName,
      )}/v/1.2.3`,
    );
    expect(releaseUrlForSource("github", "v1.2.3")).toBe(
      `${UPDATER_CONFIG.sources.github.webBaseUrl}/${UPDATER_CONFIG.githubRepo}/releases/tag/v1.2.3`,
    );
  });

  test("builds release metadata URLs from configured bases", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrls.push(fetchInputUrl(url));
      return new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 });
    }) as typeof fetch;

    process.env.ALTERTABLE_UPDATE_REGISTRY_URL = "https://registry.example.test/custom/";
    await fetchLatestRelease({ source: "npm", fetchImpl });

    expect(requestedUrls[0]).toBe(
      `https://registry.example.test/custom/${encodeURIComponent(
        UPDATER_CONFIG.packageName,
      )}/latest`,
    );
  });

  test("builds GitHub release URL from configured repository", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrls.push(fetchInputUrl(url));
      return new Response(JSON.stringify({ tag_name: "v1.2.3" }), { status: 200 });
    }) as typeof fetch;

    process.env.ALTERTABLE_UPDATE_GITHUB_REPO = "example/custom-cli";
    const release = await fetchLatestRelease({ source: "github", fetchImpl });

    expect(requestedUrls[0]).toBe(
      `${UPDATER_CONFIG.sources.github.apiBaseUrl}/example/custom-cli/releases/latest`,
    );
    expect(release.releaseUrl).toBe(
      `${UPDATER_CONFIG.sources.github.webBaseUrl}/${UPDATER_CONFIG.githubRepo}/releases`,
    );
  });

  test("reads npm latest metadata", async () => {
    const release = await fetchLatestRelease({
      source: "npm",
      fetchImpl: jsonFetch({ version: "1.2.3" }),
    });

    expect(release).toEqual({
      version: "1.2.3",
      source: "npm",
      releaseUrl: "https://www.npmjs.com/package/%40altertable%2Fcli/v/1.2.3",
    });
  });

  test("reads GitHub latest release metadata", async () => {
    const release = await fetchLatestRelease({
      source: "github",
      fetchImpl: jsonFetch({
        tag_name: "v1.2.3",
        html_url: "https://github.com/altertable-ai/altertable-cli/releases/tag/v1.2.3",
      }),
    });

    expect(release.version).toBe("1.2.3");
    expect(release.source).toBe("github");
    expect(release.releaseUrl).toContain("releases/tag/v1.2.3");
  });

  test("checkForUpdate writes cached state", async () => {
    const result = await checkForUpdate({
      source: "npm",
      fetchImpl: jsonFetch({ version: "1.2.3" }),
    });

    expect(result.update_available).toBe(true);
    expect(readUpdateState().latest_version).toBe("1.2.3");
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

  test("recommends install commands from installation origin", () => {
    expect(
      recommendedInstallCommand("1.2.3", {
        kind: "native-binary",
        executablePath: "/usr/local/bin/altertable",
      }),
    ).toBe("altertable update --install");
    expect(
      recommendedInstallCommand("1.2.3", {
        kind: "package-manager",
        executablePath: "/usr/local/lib/node_modules/@altertable/cli/dist/cli.js",
      }),
    ).toContain(`${UPDATER_CONFIG.packageName}@1.2.3`);
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
      return new Response(
        JSON.stringify({
          tag_name: "v1.2.3",
          html_url: "https://github.com/altertable-ai/altertable-cli/releases/tag/v1.2.3",
          assets: [
            {
              name: "altertable-linux-x64",
              browser_download_url: "https://download.example/altertable-linux-x64",
            },
            {
              name: "checksums.txt",
              browser_download_url: "https://download.example/checksums.txt",
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const release = await fetchGitHubBinaryRelease({
      version: "1.2.3",
      platform: "linux-x64",
      fetchImpl,
    });

    expect(requestedUrls[0]).toContain("/releases/tags/v1.2.3");
    expect(release.assetName).toBe(releaseAssetName("linux-x64"));
    expect(release.assetDownloadUrl).toBe("https://download.example/altertable-linux-x64");
  });

  test("installs a GitHub binary after checksum verification and verifies version", async () => {
    const targetPath = join(testHome, "altertable");
    const newBinary = "#!/bin/sh\necho 1.2.3\n";
    const hash = sha256(newBinary);
    writeFileSync(targetPath, "#!/bin/sh\necho 1.0.0\n", { mode: 0o755 });

    const fetchImpl = (async (url: string | URL | Request) => {
      const requestedUrl = fetchInputUrl(url);
      if (requestedUrl.includes("/releases/tags/v1.2.3")) {
        return new Response(
          JSON.stringify({
            tag_name: "v1.2.3",
            html_url: "https://github.com/altertable-ai/altertable-cli/releases/tag/v1.2.3",
            assets: [
              {
                name: "altertable-linux-x64",
                browser_download_url: "https://download.example/altertable-linux-x64",
              },
              {
                name: "checksums.txt",
                browser_download_url: "https://download.example/checksums.txt",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (requestedUrl.endsWith("/altertable-linux-x64")) {
        return new Response(newBinary, { status: 200 });
      }
      if (requestedUrl.endsWith("/checksums.txt")) {
        return new Response(`${hash}  altertable-linux-x64\n`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await installGitHubBinaryRelease("1.2.3", {
      targetPath,
      platform: "linux-x64",
      fetchImpl,
    });

    expect(result.method).toBe("github-binary");
    expect(result.verified_version).toBe("1.2.3");
    expect(readFileSync(targetPath, "utf8")).toBe(newBinary);
  });

  test("rejects GitHub binary install on checksum mismatch without replacing target", async () => {
    const targetPath = join(testHome, "altertable");
    const originalBinary = "#!/bin/sh\necho 1.0.0\n";
    writeFileSync(targetPath, originalBinary, { mode: 0o755 });

    const fetchImpl = (async (url: string | URL | Request) => {
      const requestedUrl = fetchInputUrl(url);
      if (requestedUrl.includes("/releases/tags/v1.2.3")) {
        return new Response(
          JSON.stringify({
            tag_name: "v1.2.3",
            assets: [
              {
                name: "altertable-linux-x64",
                browser_download_url: "https://download.example/altertable-linux-x64",
              },
              {
                name: "checksums.txt",
                browser_download_url: "https://download.example/checksums.txt",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (requestedUrl.endsWith("/altertable-linux-x64")) {
        return new Response("#!/bin/sh\necho 1.2.3\n", { status: 200 });
      }
      return new Response(`${"0".repeat(64)}  altertable-linux-x64\n`, { status: 200 });
    }) as typeof fetch;

    try {
      await installGitHubBinaryRelease("1.2.3", {
        targetPath,
        platform: "linux-x64",
        fetchImpl,
      });
      throw new Error("Expected checksum verification to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Checksum verification failed");
    }
    expect(readFileSync(targetPath, "utf8")).toBe(originalBinary);
  });

  test("auto install rejects source checkouts but explicit package-manager can run", async () => {
    try {
      await installCliUpdate("1.2.3", {
        verify: false,
        installation: {
          kind: "source",
          executablePath: "/repo/cli/src/cli.ts",
          reason: "test",
        },
        spawnImpl: (() => {
          throw new Error("should not spawn");
        }) as unknown as typeof import("node:child_process").spawnSync,
      });
      throw new Error("Expected automatic install to reject source checkouts.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Automatic CLI install is not supported");
    }

    process.env.ALTERTABLE_UPDATE_INSTALLER = "npm";
    const commands: string[] = [];
    const result = await installCliUpdate("1.2.3", {
      method: "package-manager",
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

    expect(commands[0]).toBe(`npm install -g ${UPDATER_CONFIG.packageName}@1.2.3`);
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
    for (const commandName of UPDATER_CONFIG.automaticCheckSkipCommands) {
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
    expect(detectInstallManager({ ALTERTABLE_UPDATE_INSTALLER: "invalid" })).toBe(
      UPDATER_CONFIG.defaults.installManager,
    );
  });

  test("does not reject when failure state persistence is unavailable", async () => {
    mkdirSync(join(testHome, UPDATER_CONFIG.stateFileName));

    await maybeShowUpdateNotice({
      context: { debug: false, json: false, agent: false },
      commandName: "context",
      stderrIsTTY: true,
      fetchImpl: (async () => {
        throw new Error("network unavailable");
      }) as unknown as typeof fetch,
    });
  });
});

describe("update command", () => {
  test("reports explicit target version without network", async () => {
    const stdout: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeHuman = (text) => {
      stdout.push(text);
    };

    await runWithCliRuntime(runtime, async () => {
      await runCommand(buildMainCommand(), { rawArgs: ["update", "--target-version", "1.2.3"] });
    });

    expect(stdout[0]).toContain("altertable 1.2.3 is available");
  });

  test("configures automatic check interval", async () => {
    const stdout: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeHuman = (text) => {
      stdout.push(text);
    };

    await runWithCliRuntime(runtime, async () => {
      await runCommand(buildMainCommand(), {
        rawArgs: ["update", "--check-interval", "weekly"],
      });
    });

    expect(stdout[0]).toContain("Auto update checks: weekly");
    expect(getUpdateCheckInterval()).toBe("weekly");
  });

  test("accepts every configured update source option", async () => {
    for (const source of UPDATE_SOURCES) {
      const stdout: string[] = [];
      const runtime = createCliRuntime({ debug: false, json: false, agent: false });
      runtime.output.writeHuman = (text) => {
        stdout.push(text);
      };

      await runWithCliRuntime(runtime, async () => {
        await runCommand(buildMainCommand(), {
          rawArgs: ["update", "--source", source, "--target-version", "1.2.3"],
        });
      });

      expect(stdout[0]).toContain("altertable 1.2.3 is available");
      expect(stdout[0]).toContain(`Release: ${releaseUrlForSource(source, "1.2.3")}`);
    }
  });

  test("accepts every configured automatic check interval option", async () => {
    for (const interval of UPDATE_CHECK_INTERVALS) {
      const stdout: string[] = [];
      const runtime = createCliRuntime({ debug: false, json: false, agent: false });
      runtime.output.writeHuman = (text) => {
        stdout.push(text);
      };

      await runWithCliRuntime(runtime, async () => {
        await runCommand(buildMainCommand(), {
          rawArgs: ["update", "--check-interval", interval],
        });
      });

      expect(stdout[0]).toContain(`Auto update checks: ${interval}`);
      expect(getUpdateCheckInterval()).toBe(interval);
    }
  });

  test("exposes every configured install method option", () => {
    expect(UPDATE_INSTALL_METHODS).toContain("auto");
    expect(UPDATE_INSTALL_METHODS).toContain("package-manager");
    expect(UPDATE_INSTALL_METHODS).toContain("github-binary");
  });

  test("falls back to configured source default for invalid environment override", () => {
    process.env.ALTERTABLE_UPDATE_SOURCE = "invalid";

    expect(resolveUpdateSource()).toBe(UPDATER_CONFIG.defaults.source);
  });
});
