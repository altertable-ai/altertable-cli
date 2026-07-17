import { VERSION } from "@/version.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineCommand } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import {
  checkForUpdate,
  compareVersions,
  formatUpdateResult,
  installCliUpdate,
  isValidVersion,
  normalizeVersion,
  recommendedInstallCommand,
  releaseUrlForSource,
  resolveUpdateSource,
  type UpdateCheckResult,
} from "@/lib/updater.ts";

export const updateCommand = defineCommand({
  meta: {
    name: "update",
    alias: ["upgrade"],
    commandGroup: "platform",
    description: "Update Altertable CLI to the latest release.",
    examples: ["altertable update", "altertable update --check", "altertable update 1.2.0 --force"],
  },
  args: {
    version: {
      type: "positional",
      description: "Specific version to install (default: latest).",
      required: false,
    },
    check: {
      type: "boolean",
      description: "Check for an update without installing it.",
    },
    force: {
      type: "boolean",
      description: "Reinstall or downgrade to the selected release.",
    },
  },
  async run({ args, sink }) {
    await executeUpdateCommand(args as UpdateCommandArgs, sink);
  },
});

export type UpdateCommandArgs = {
  version?: string;
  check?: boolean;
  force?: boolean;
};

export type UpdateCommandDependencies = {
  checkForUpdate: typeof checkForUpdate;
  installCliUpdate: typeof installCliUpdate;
};

const DEFAULT_DEPENDENCIES: UpdateCommandDependencies = { checkForUpdate, installCliUpdate };

function buildTargetResult(targetVersion: string): UpdateCheckResult {
  const version = normalizeVersion(targetVersion);
  if (!isValidVersion(version)) {
    throw new CliError(`Invalid update version: ${targetVersion}.`, {
      details: "Expected a semantic version such as 1.2.0 or 1.3.0-rc.1.",
    });
  }
  const source = resolveUpdateSource();
  return {
    current_version: VERSION,
    latest_version: version,
    update_available: compareVersions(version, VERSION) > 0,
    source,
    release_url: releaseUrlForSource(source, version),
    checked_at: new Date().toISOString(),
    install_command: recommendedInstallCommand(version),
  };
}

async function writeUpdateCheck(
  result: UpdateCheckResult,
  targetVersion: string,
  sink: OutputSink,
): Promise<void> {
  await writeCommandOutput(
    {
      kind: "normalized",
      data: result,
      humanText: formatUpdateResult(result, targetVersion),
    },
    sink,
  );
}

export async function executeUpdateCommand(
  args: UpdateCommandArgs,
  sink: OutputSink,
  dependencies: UpdateCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const targetVersion = asCliArgString(args.version);
  const result = targetVersion
    ? buildTargetResult(targetVersion)
    : await dependencies.checkForUpdate();

  if (args.check) {
    await writeUpdateCheck(result, targetVersion, sink);
    return;
  }

  if (
    !args.force &&
    targetVersion &&
    compareVersions(result.latest_version, result.current_version) < 0
  ) {
    throw new CliError(`Target version v${result.latest_version} is older than v${VERSION}.`);
  }
  if (!args.force && !result.update_available) {
    await writeUpdateCheck(result, targetVersion, sink);
    return;
  }

  sink.writeMetadata([`Updating altertable to ${result.latest_version}`]);
  const installed = await dependencies.installCliUpdate(result.latest_version, {
    stdio: sink.json ? "pipe" : "inherit",
  });
  await writeCommandOutput(
    {
      kind: "ack",
      data: installed,
      metadataMessage: `altertable ${installed.verified_version} installed.`,
    },
    sink,
  );
}
