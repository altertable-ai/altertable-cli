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
  UpdaterCheckIntervals,
  UpdaterInstallMethods,
  UpdaterSources,
  UpdaterConfig,
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

  if (interval && !args["clear-cache"] && !args.install && !args["target-version"]) {
    await writeStatus(sink);
    return;
  }

  const source = args.source ?? UpdaterConfig.defaults.source;
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

  const method = args["install-method"] ?? UpdaterConfig.defaults.installMethod;
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
    description: "Check for a newer Altertable CLI release and optionally install it.",
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
      description: "Install the latest available release after the update check succeeds.",
    },
    force: {
      type: "boolean",
      description: "Reinstall the selected release even when it is not newer than the current CLI.",
    },
    source: {
      type: "enum",
      options: [...UpdaterSources],
      description: `Where to look for release metadata: npm or GitHub (default: ${UpdaterConfig.defaults.source}).`,
    },
    "target-version": {
      type: "string",
      description: "Use an explicit version instead of discovering the latest release.",
    },
    "install-method": {
      type: "enum",
      options: [...UpdaterInstallMethods],
      description: `How --install applies the update: auto, package-manager, or github-binary (default: ${UpdaterConfig.defaults.installMethod}).`,
    },
    "target-path": {
      type: "string",
      description: "Replace this binary path when using --install-method github-binary.",
    },
    status: {
      type: "boolean",
      description: "Show the automatic update-check policy and cached latest-release state.",
    },
    "clear-cache": {
      type: "boolean",
      description: "Delete cached update metadata before continuing.",
    },
    "check-interval": {
      type: "enum",
      options: [...UpdaterCheckIntervals],
      description: "Set how often successful human-facing commands may show update notices.",
    },
  },
  async run({ args, sink }) {
    await runUpdateCommand(args as UpdateCommandArgs, sink);
  },
});
