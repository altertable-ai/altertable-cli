import { VERSION } from "@/version.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { CliError } from "@/lib/errors.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import {
  checkForUpdate,
  clearUpdateState,
  compareVersions,
  formatUpdateResult,
  formatUpdateStatus,
  getUpdateCheckInterval,
  installCliUpdate,
  normalizeVersion,
  readUpdateState,
  recommendedInstallCommand,
  releaseUrlForSource,
  setUpdateCheckInterval,
  UPDATE_CHECK_INTERVALS,
  UPDATE_INSTALL_METHODS,
  UPDATE_SOURCES,
  UPDATER_CONFIG,
  type UpdateCheckInterval,
  type UpdateCheckResult,
  type UpdateInstallMethod,
  type UpdateSource,
} from "@/lib/updater.ts";

type UpdateCommandArgs = {
  install?: boolean;
  force?: boolean;
  source?: UpdateSource;
  "target-version"?: string;
  "install-method"?: UpdateInstallMethod;
  "target-path"?: string;
  status?: boolean;
  "clear-cache"?: boolean;
  "check-interval"?: UpdateCheckInterval;
};

function buildTargetResult(targetVersion: string, source: UpdateSource): UpdateCheckResult {
  const version = normalizeVersion(targetVersion);
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

async function writeStatus(sink: OutputSink): Promise<void> {
  const interval = getUpdateCheckInterval();
  const state = readUpdateState();
  await writeCommandOutput(
    {
      kind: "normalized",
      data: {
        update_check_interval: interval,
        state,
      },
      humanText: formatUpdateStatus(interval, state),
    },
    sink,
  );
}

async function runUpdateCommand(args: UpdateCommandArgs, sink: OutputSink): Promise<void> {
  const interval = args["check-interval"];
  if (interval) {
    setUpdateCheckInterval(interval);
  }

  if (args["clear-cache"]) {
    clearUpdateState();
  }

  if (args.status && !args.install && !args["target-version"]) {
    await writeStatus(sink);
    return;
  }

  if ((interval || args["clear-cache"]) && !args.install && !args["target-version"]) {
    await writeStatus(sink);
    return;
  }

  const source = args.source ?? UPDATER_CONFIG.defaults.source;
  const targetVersion = asCliArgString(args["target-version"]);
  const result = targetVersion
    ? buildTargetResult(targetVersion, source)
    : await checkForUpdate({ source });

  if (!args.install) {
    await writeCommandOutput(
      {
        kind: "normalized",
        data: result,
        humanText: formatUpdateResult(result),
      },
      sink,
    );
    return;
  }

  if (!result.update_available && !args.force) {
    throw new CliError(
      targetVersion
        ? "Target version is not newer than the installed CLI. Pass --force to install it anyway."
        : "altertable is already up to date. Pass --force to reinstall the current latest version.",
    );
  }

  const method = args["install-method"] ?? UPDATER_CONFIG.defaults.installMethod;
  const methodLabel = method === "auto" ? "automatic installer" : method;
  sink.writeMetadata([`Running ${methodLabel} for altertable ${result.latest_version}`]);
  const installed = await installCliUpdate(result.latest_version, {
    method,
    targetPath: asCliArgString(args["target-path"]),
    stdio: sink.json ? "pipe" : "inherit",
  });
  await writeCommandOutput(
    {
      kind: "ack",
      data: {
        ...installed,
      },
      metadataMessage: `altertable ${installed.verified_version} installed.`,
    },
    sink,
  );
}

export const updateCommand = defineAltertableCommand({
  meta: {
    name: "update",
    description: "Check for and install Altertable CLI updates.",
    examples: [
      "altertable update",
      "altertable update --install",
      "altertable update --status",
      "altertable update --check-interval never",
    ],
  },
  args: {
    install: {
      type: "boolean",
      description: "Install the latest available CLI version after checking.",
    },
    force: {
      type: "boolean",
      description: "Install even when the target version is not newer.",
    },
    source: {
      type: "enum",
      options: [...UPDATE_SOURCES],
      description: `Release metadata source (default: ${UPDATER_CONFIG.defaults.source}).`,
    },
    "target-version": {
      type: "string",
      description: "Install or inspect an explicit version instead of checking latest.",
    },
    "install-method": {
      type: "enum",
      options: [...UPDATE_INSTALL_METHODS],
      description: `Installer strategy for --install (default: ${UPDATER_CONFIG.defaults.installMethod}).`,
    },
    "target-path": {
      type: "string",
      description: "Override the binary path for github-binary installs.",
    },
    status: {
      type: "boolean",
      description: "Show cached update state and automatic check policy.",
    },
    "clear-cache": {
      type: "boolean",
      description: "Clear cached update metadata.",
    },
    "check-interval": {
      type: "enum",
      options: [...UPDATE_CHECK_INTERVALS],
      description: "Configure automatic update notices.",
    },
  },
  async run({ args, sink }) {
    await runUpdateCommand(args as UpdateCommandArgs, sink);
  },
});
