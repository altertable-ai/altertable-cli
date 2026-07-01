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
  createInstallPlan,
  formatUpdateResult,
  formatUpdateStatus,
  getUpdateCheckInterval,
  normalizeVersion,
  packageReleaseUrl,
  readUpdateState,
  runInstallPlan,
  setUpdateCheckInterval,
  UPDATE_CHECK_INTERVALS,
  UPDATE_SOURCES,
  UPDATER_CONFIG,
  type UpdateCheckInterval,
  type UpdateCheckResult,
  type UpdateSource,
} from "@/lib/updater.ts";

type UpdateCommandArgs = {
  install?: boolean;
  force?: boolean;
  source?: UpdateSource;
  "target-version"?: string;
  status?: boolean;
  "clear-cache"?: boolean;
  "check-interval"?: UpdateCheckInterval;
};

function buildTargetResult(targetVersion: string, source: UpdateSource): UpdateCheckResult {
  const version = normalizeVersion(targetVersion);
  const installPlan = createInstallPlan(version);
  return {
    current_version: VERSION,
    latest_version: version,
    update_available: compareVersions(version, VERSION) > 0,
    source,
    release_url: packageReleaseUrl(version),
    checked_at: new Date().toISOString(),
    install_command: installPlan.display,
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

  const plan = createInstallPlan(result.latest_version);
  sink.writeMetadata([`Running ${plan.display}`]);
  runInstallPlan(plan);
  await writeCommandOutput(
    {
      kind: "ack",
      data: {
        installed_version: result.latest_version,
        manager: plan.manager,
        command: plan.display,
      },
      metadataMessage: `altertable ${result.latest_version} installed.`,
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
