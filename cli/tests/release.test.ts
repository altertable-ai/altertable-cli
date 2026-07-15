import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReleaseTag,
  assertToolchain,
  buildJavaScriptBundle,
  compileCommand,
  expectedReleaseTag,
  HARDENED_COMPILE_FLAGS,
  JAVASCRIPT_BUNDLE_OPTIONS,
  nativeReleaseTarget,
  readToolchainContract,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  SUPPORTED_BUN_RUNTIME_RANGE,
  writeReleaseMetadata,
} from "@/../scripts/release.ts";
import { NPM_BUNDLE_PATH } from "@/../scripts/npm-bundle.ts";
import {
  githubReleasePublishCommand,
  githubReleaseUploadCommand,
} from "@/../scripts/github-release.ts";
import {
  assertTrustedPublishingEnvironment,
  MINIMUM_TRUSTED_PUBLISHING_NPM_VERSION,
  npmPublicationRequired,
  parseNpmVersionLookup,
} from "@/../scripts/publish-npm.ts";
import { UpdaterConfig } from "@/lib/updater-config.ts";
import { releaseAssetName } from "@/lib/updater.ts";
import {
  RELEASE_BUNDLE_ASSET,
  RELEASE_CHECKSUMS_ASSET,
  RELEASE_METADATA_ASSET,
  RELEASE_TARGETS,
  releaseCiMatrix,
} from "@/release-manifest.ts";
import { VERSION } from "@/version.ts";

const temporaryDirectories: string[] = [];
const repositoryRoot = join(import.meta.dir, "../..");

type WorkflowStep = {
  env?: Record<string, unknown>;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};
type WorkflowJob = {
  if?: string;
  name?: string;
  needs?: string | string[];
  permissions?: Record<string, unknown>;
  steps?: WorkflowStep[];
  uses?: string;
  with?: Record<string, string>;
};
type Workflow = {
  jobs: Record<string, WorkflowJob>;
  on?: {
    workflow_dispatch?: {
      inputs?: Record<string, { description?: string; required?: boolean; type?: string }>;
    };
  };
};

async function readWorkflow(name: string): Promise<Workflow> {
  return Bun.YAML.parse(
    await readFile(join(repositoryRoot, ".github/workflows", name), "utf8"),
  ) as Workflow;
}

function workflowNeeds(job: WorkflowJob): string[] {
  if (!job.needs) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

function workflowStepIndex(job: WorkflowJob, name: string): number {
  return job.steps?.findIndex((step) => step.name === name) ?? -1;
}

async function fileSha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(path).arrayBuffer());
  return hasher.digest("hex");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("release target manifest", () => {
  test("defines unique updater-compatible targets and artifacts", () => {
    expect(RELEASE_TARGETS).toHaveLength(4);
    expect(new Set(RELEASE_TARGETS.map((target) => target.bunTarget)).size).toBe(
      RELEASE_TARGETS.length,
    );
    expect(new Set(RELEASE_TARGETS.map((target) => target.platform)).size).toBe(
      RELEASE_TARGETS.length,
    );
    expect(new Set(RELEASE_TARGETS.map((target) => target.asset)).size).toBe(
      RELEASE_TARGETS.length,
    );
    expect(RELEASE_TARGETS.find((target) => target.platform === "linux-x64")?.bunTarget).toBe(
      "bun-linux-x64-baseline",
    );
    expect(Object.keys(UpdaterConfig.releasePlatforms).sort()).toEqual(
      RELEASE_TARGETS.map((target) => target.platform).sort(),
    );
    for (const target of RELEASE_TARGETS) {
      expect(releaseAssetName(target.platform)).toBe(target.asset);
    }
    expect(RELEASE_TARGETS.map((target) => target.asset).sort()).toEqual([
      "altertable-darwin-arm64",
      "altertable-darwin-x64",
      "altertable-linux-arm64",
      "altertable-linux-x64",
    ]);
  });

  test("generates the complete GitHub Actions matrix", () => {
    expect(releaseCiMatrix()).toEqual({
      include: RELEASE_TARGETS.map((target) => ({
        target: target.bunTarget,
        artifact: target.asset,
        runner: target.runner,
      })),
    });
  });

  test("uses supported runner images for every release target", () => {
    expect(RELEASE_TARGETS.find(({ platform }) => platform === "darwin-arm64")?.runner).toBe(
      "macos-15",
    );
    expect(RELEASE_TARGETS.map(({ runner }) => runner)).not.toContain("macos-14");
  });

  test("detects native targets without changing public asset names", () => {
    expect(nativeReleaseTarget("darwin", "arm64").asset).toBe("altertable-darwin-arm64");
    expect(nativeReleaseTarget("linux", "x64").asset).toBe("altertable-linux-x64");
    expect(() => nativeReleaseTarget("win32", "x64")).toThrow(
      "Unsupported native release platform: win32-x64.",
    );
  });
});

describe("release toolchain contract", () => {
  test("pins the build toolchain without raising the package runtime floor", async () => {
    const contract = await readToolchainContract();

    expect(contract.bunVersion).toBe(Bun.version);
    expect(contract.packageManager).toBe(`bun@${contract.bunVersion}`);
    expect(contract.enginesBun).toBe(SUPPORTED_BUN_RUNTIME_RANGE);
    expect(contract.enginesBun).not.toBe(`>=${contract.bunVersion}`);
    expect(await assertToolchain()).toEqual(contract);
    let error: unknown;
    try {
      await assertToolchain("0.0.0");
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      `Release builds require Bun ${contract.bunVersion}; received 0.0.0.`,
    );
  });

  test("requires release tags to match the CLI version", () => {
    expect(expectedReleaseTag).toBe(`v${VERSION}`);
    expect(() => assertReleaseTag(expectedReleaseTag)).not.toThrow();
    expect(() => assertReleaseTag("v0.0.0")).toThrow(
      `Release tag must be ${expectedReleaseTag}; received v0.0.0.`,
    );
  });

  test("uses hardened standalone compiler flags", () => {
    const target = RELEASE_TARGETS[0];
    const command = compileCommand(target, "/tmp/altertable-test-binary");

    expect(command).toContain("--compile");
    expect(command).toContain("--minify");
    expect(command).toContain("--bytecode");
    expect(command).toContain("--reject-unresolved");
    expect(command).toContain("--no-compile-autoload-dotenv");
    expect(command).toContain("--no-compile-autoload-bunfig");
    expect(command).toContain(`--target=${target.bunTarget}`);
    expect(command).toContain("--outfile=/tmp/altertable-test-binary");
    expect(new Set(HARDENED_COMPILE_FLAGS).size).toBe(HARDENED_COMPILE_FLAGS.length);
  });
});

describe("release metadata", () => {
  test("writes a complete, checksummed release inventory atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "altertable-release-test-"));
    temporaryDirectories.push(directory);
    for (const target of RELEASE_TARGETS) {
      await Bun.write(join(directory, target.asset), target.bunTarget);
    }
    await Bun.write(join(directory, RELEASE_BUNDLE_ASSET), "console.log('altertable');\n");

    const metadata = await writeReleaseMetadata(directory);
    const onDisk = JSON.parse(
      await readFile(join(directory, RELEASE_METADATA_ASSET), "utf8"),
    ) as typeof metadata;
    const checksums = await readFile(join(directory, RELEASE_CHECKSUMS_ASSET), "utf8");
    const checksumEntries = new Map(
      checksums
        .trim()
        .split("\n")
        .map((line) => {
          const [digest, file] = line.split(/\s+/, 2);
          if (!digest || !file) throw new Error(`Invalid checksum line: ${line}`);
          return [file, digest] as const;
        }),
    );

    expect(metadata.schemaVersion).toBe(RELEASE_MANIFEST_SCHEMA_VERSION);
    expect(metadata.version).toBe(VERSION);
    expect(metadata.tag).toBe(expectedReleaseTag);
    expect(metadata.toolchain.bunVersion).toBe(Bun.version);
    expect(metadata.artifacts).toHaveLength(RELEASE_TARGETS.length + 1);
    expect(onDisk).toEqual(metadata);
    for (const artifact of metadata.artifacts) {
      expect(artifact.bytes).toBeGreaterThan(0);
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(checksumEntries.get(artifact.file)).toBe(
        await fileSha256(join(directory, artifact.file)),
      );
    }
    for (const target of RELEASE_TARGETS) {
      const artifact = metadata.artifacts.find(({ file }) => file === target.asset);
      expect(artifact?.recipe).toEqual({
        builder: "bun-build-executable",
        bunVersion: Bun.version,
        target: target.bunTarget,
        flags: HARDENED_COMPILE_FLAGS,
      });
    }
    expect(metadata.artifacts.find(({ kind }) => kind === "javascript")?.recipe).toEqual({
      builder: "bun-build",
      bunVersion: Bun.version,
      ...JAVASCRIPT_BUNDLE_OPTIONS,
    });
    expect(checksumEntries.get(RELEASE_METADATA_ASSET)).toBe(
      await fileSha256(join(directory, RELEASE_METADATA_ASSET)),
    );
    expect([...checksumEntries.keys()].sort((left, right) => left.localeCompare(right))).toEqual(
      [...metadata.artifacts.map(({ file }) => file), RELEASE_METADATA_ASSET].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
  });

  test("stages the exact npm bundle as the GitHub JavaScript asset", async () => {
    const directory = await mkdtemp(join(tmpdir(), "altertable-release-bundle-test-"));
    temporaryDirectories.push(directory);

    const releaseBundle = await buildJavaScriptBundle(directory);

    expect(await fileSha256(releaseBundle)).toBe(await fileSha256(NPM_BUNDLE_PATH));
  });
});

describe("retry-safe npm publication", () => {
  test("distinguishes published versions, missing versions, and registry failures", () => {
    expect(parseNpmVersionLookup(0, '"1.1.0"\n', "")).toEqual({
      status: "published",
      version: "1.1.0",
    });
    expect(parseNpmVersionLookup(1, "", "npm error code E404")).toEqual({ status: "missing" });
    expect(() => parseNpmVersionLookup(1, "", "network timeout")).toThrow(
      "npm view failed (1): network timeout",
    );
    expect(npmPublicationRequired({ status: "missing" }, "1.1.0")).toBe(true);
    expect(npmPublicationRequired({ status: "published", version: "1.1.0" }, "1.1.0")).toBe(false);
    expect(() =>
      npmPublicationRequired({ status: "published", version: "1.0.0" }, "1.1.0"),
    ).toThrow("npm returned version 1.0.0; expected 1.1.0");
  });

  test("requires tokenless GitHub OIDC and a compatible npm CLI before publishing", () => {
    const oidcEnvironment = {
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "ephemeral-token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example.test/oidc",
    };

    expect(() =>
      assertTrustedPublishingEnvironment(oidcEnvironment, MINIMUM_TRUSTED_PUBLISHING_NPM_VERSION),
    ).not.toThrow();
    expect(() => assertTrustedPublishingEnvironment(oidcEnvironment, "12.0.0")).not.toThrow();
    expect(() => assertTrustedPublishingEnvironment(oidcEnvironment, "11.5.0")).toThrow(
      `npm trusted publishing requires npm >=${MINIMUM_TRUSTED_PUBLISHING_NPM_VERSION}`,
    );
    expect(() => assertTrustedPublishingEnvironment({}, "12.0.0")).toThrow(
      "npm trusted publishing requires GitHub Actions OIDC credentials",
    );
    expect(() =>
      assertTrustedPublishingEnvironment(
        { ...oidcEnvironment, NODE_AUTH_TOKEN: "secret" },
        "12.0.0",
      ),
    ).toThrow("npm publishing must use OIDC");
  });
});

describe("GitHub release publication", () => {
  test("uploads the complete manifest-owned asset set before publishing the draft", () => {
    const upload = githubReleaseUploadCommand("v1.1.0");
    const publish = githubReleasePublishCommand("v1.1.0");

    expect(upload.slice(0, 4)).toEqual(["gh", "release", "upload", "v1.1.0"]);
    for (const target of RELEASE_TARGETS) expect(upload.join("\n")).toContain(target.asset);
    for (const asset of [RELEASE_BUNDLE_ASSET, RELEASE_METADATA_ASSET, RELEASE_CHECKSUMS_ASSET]) {
      expect(upload.join("\n")).toContain(asset);
    }
    expect(upload.at(-1)).toBe("--clobber");
    expect(publish).toEqual(["gh", "release", "edit", "v1.1.0", "--draft=false", "--latest"]);
  });
});

describe("release infrastructure wiring", () => {
  test("keeps target literals out of build and workflow orchestration", async () => {
    const files = [
      "Makefile",
      ".github/workflows/test.yml",
      ".github/workflows/release-please.yml",
    ];
    for (const file of files) {
      const contents = await readFile(join(repositoryRoot, file), "utf8");
      for (const target of RELEASE_TARGETS) {
        expect(contents).not.toContain(target.bunTarget);
      }
    }
  });

  test("enforces hardened workflow conventions", async () => {
    const workflows = [
      "codeql.yml",
      "dependency-review.yml",
      "release-please.yml",
      "semantic-pull-request.yml",
      "test.yml",
      "verify.yml",
    ];
    for (const workflow of workflows) {
      const contents = await readFile(join(repositoryRoot, ".github/workflows", workflow), "utf8");
      expect(contents).toContain("permissions:");
      expect(contents).toContain("timeout-minutes:");
      expect(contents).not.toContain("runs-on: ubuntu-latest");
      expect(contents).not.toContain("continue-on-error: true");

      const actionReferences = [...contents.matchAll(/uses:\s+[^@\s]+@([^\s]+)/g)];
      for (const reference of actionReferences) {
        expect(reference[1]).toMatch(/^[0-9a-f]{40}$/);
      }
      if (contents.includes("actions/checkout@")) {
        expect(contents).toContain("persist-credentials: false");
      }
    }
  });

  test("gates ordered draft publication on canonical and native verification", async () => {
    const workflow = await readWorkflow("release-please.yml");
    const releasePleaseConfig = JSON.parse(
      await readFile(join(repositoryRoot, "release-please-config.json"), "utf8"),
    ) as { packages: Record<string, { draft?: boolean }> };
    const preparation = workflow.jobs["release-please"] ?? {};
    const context = workflow.jobs["release-context"] ?? {};
    const verification = workflow.jobs["verify-release"] ?? {};
    const matrix = workflow.jobs["release-matrix"] ?? {};
    const native = workflow.jobs["release-native"] ?? {};
    const publication = workflow.jobs["release-artifacts"] ?? {};

    expect(releasePleaseConfig.packages["."]?.draft).toBe(true);
    expect(workflow.on?.workflow_dispatch?.inputs?.release_tag).toEqual({
      description: "Existing draft release tag to recover (for example, v1.2.0)",
      required: true,
      type: "string",
    });
    expect(preparation.if).toContain("github.event_name == 'push'");
    expect(workflowNeeds(context)).toEqual(["release-please"]);
    expect(context.if).toContain("workflow_dispatch");
    const contextScript = context.steps?.find(
      ({ name }) => name === "Resolve automatic or recovery release",
    )?.run;
    expect(contextScript).toContain("isDraft,targetCommitish");
    expect(contextScript).toContain("immutable commit SHA");
    expect(verification.uses).toBe("./.github/workflows/verify.yml");
    expect(workflowNeeds(verification)).toEqual(["release-context"]);
    expect(verification.with?.ref).toContain("release_ref");
    expect(workflowNeeds(matrix)).toEqual(["release-context", "verify-release"]);
    expect(workflowNeeds(native)).toEqual(["release-context", "verify-release", "release-matrix"]);
    expect(workflowNeeds(publication)).toEqual(["release-context", "release-native"]);

    const orderedSteps = [
      "Download tested release binaries",
      "Build JavaScript release bundle",
      "Finalize exact release artifacts",
      "Smoke test npm bundle on release toolchain",
      "Install minimum supported npm runtime",
      "Smoke test exact npm bundle on minimum runtime",
      "Restore release build toolchain",
      "Verify release checksums",
      "Attest release provenance",
      "Upload release assets",
      "Publish npm package",
      "Publish completed GitHub release",
    ].map((name) => workflowStepIndex(publication, name));
    expect(orderedSteps.every((index) => index >= 0)).toBe(true);
    expect(orderedSteps).toEqual([...orderedSteps].sort((left, right) => left - right));
    expect(publication.steps?.[orderedSteps[10] ?? -1]?.run).toBe("bun run release:publish-npm");
    expect(publication.steps?.[orderedSteps[9] ?? -1]?.run).toBe("bun run release:upload-github");
    expect(publication.steps?.[orderedSteps[11] ?? -1]?.run).toBe("bun run release:publish-github");
  });

  test("retains recoverable release binaries longer than diagnostic artifacts", async () => {
    const releaseWorkflow = await readWorkflow("release-please.yml");
    const verificationWorkflow = await readWorkflow("verify.yml");
    const branchWorkflow = await readWorkflow("test.yml");

    const releaseUpload = releaseWorkflow.jobs["release-native"]?.steps?.find(
      ({ name }) => name === "Upload tested release binary",
    );
    const coverageUpload = verificationWorkflow.jobs.repository?.steps?.find(
      ({ name }) => name === "Upload coverage report",
    );
    const branchUpload = branchWorkflow.jobs.compile?.steps?.find(
      ({ name }) => name === "Upload compiled binary",
    );

    expect(releaseUpload?.with?.["retention-days"]).toBe(30);
    expect(coverageUpload?.with?.["retention-days"]).toBe(7);
    expect(branchUpload?.with?.["retention-days"]).toBe(7);
  });

  test("publishes npm through trusted publishing without a long-lived token", async () => {
    const workflow = await readWorkflow("release-please.yml");
    const publication = workflow.jobs["release-artifacts"] ?? {};
    const publishStep = publication.steps?.find(({ name }) => name === "Publish npm package");

    expect(publication.permissions?.["id-token"]).toBe("write");
    expect(publishStep?.run).toBe("bun run release:publish-npm");
    expect(publishStep?.env?.NODE_AUTH_TOKEN).toBeUndefined();
    expect(publishStep?.env?.NPM_TOKEN).toBeUndefined();
    expect(
      await readFile(join(repositoryRoot, ".github/workflows/release-please.yml"), "utf8"),
    ).not.toContain("NPM_TOKEN");
  });

  test("pins the integration image and waits for its TCP listener", async () => {
    const workflow = await readFile(join(repositoryRoot, ".github/workflows/verify.yml"), "utf8");

    expect(workflow).toContain(
      "ghcr.io/altertable-ai/altertable-mock@sha256:2e85cecd30b582a28196fc7574b2c7ae323378ccf40abfe658e2692270799977",
    );
    expect(workflow).toContain("/dev/tcp/127.0.0.1/15000");
    expect(workflow).not.toContain("altertable-mock:latest");
    expect(workflow).not.toContain('--health-cmd "exit 0"');
  });

  test("keeps the Bun 1.1 runtime path free of Bun's newer YAML API", async () => {
    const packageJson = JSON.parse(
      await readFile(join(repositoryRoot, "cli/package.json"), "utf8"),
    ) as { dependencies: Record<string, string>; engines: { bun: string } };
    const openapiSpec = await readFile(join(repositoryRoot, "cli/src/lib/openapi-spec.ts"), "utf8");

    expect(packageJson.engines.bun).toBe(SUPPORTED_BUN_RUNTIME_RANGE);
    expect(packageJson.dependencies.yaml).toBe("2.9.0");
    expect(openapiSpec).not.toContain("Bun.YAML");

    const verification = await readWorkflow("verify.yml");
    const runtimeJob = verification.jobs["npm-runtime"] ?? {};
    expect(
      runtimeJob.steps?.find(({ name }) => name === "Install minimum supported runtime"),
    ).toEqual(
      expect.objectContaining({ uses: expect.stringMatching(/^oven-sh\/setup-bun@[0-9a-f]{40}$/) }),
    );
    expect(
      runtimeJob.steps?.find(({ name }) => name === "Smoke test npm bundle on minimum runtime")
        ?.run,
    ).toBe("bun run cli/scripts/smoke-npm-bundle.ts --expected-bun=1.1.0");
  });

  test("routes branch CI through the same canonical verification workflow", async () => {
    const workflow = await readWorkflow("test.yml");
    const verification = workflow.jobs.verify ?? {};
    const required = workflow.jobs.required ?? {};

    expect(verification.uses).toBe("./.github/workflows/verify.yml");
    expect(verification.with?.ref).toContain("github.sha");
    expect(workflowNeeds(workflow.jobs["release-matrix"] ?? {})).toContain("verify");
    expect(workflowNeeds(workflow.jobs.compile ?? {})).toContain("verify");
    expect(required.name).toBe("Required");
    expect(required.if).toBe("always()");
    expect(workflowNeeds(required)).toEqual(["verify", "release-matrix", "compile"]);

    const enforcement = required.steps?.find(({ name }) => name === "Enforce required CI results");
    expect(enforcement?.env).toEqual({
      VERIFY_RESULT: "${{ needs.verify.result }}",
      RELEASE_MATRIX_RESULT: "${{ needs.release-matrix.result }}",
      COMPILE_RESULT: "${{ needs.compile.result }}",
    });
    expect(enforcement?.run).toContain('exit "$failed"');
  });
});
