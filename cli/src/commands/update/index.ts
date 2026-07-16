import { VERSION } from "@/version.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { CliError } from "@/lib/errors.ts";
import { GLOBAL_ARGV_FLAGS_WITH_VALUE, isGlobalArgvFlag } from "@/lib/global-flags.ts";
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
const UPDATE_OPTIONS: ReadonlySet<string> = new Set(["--check", "--force"]);

function validateUpdateArguments(rawArgs: readonly string[]): void {
  let versionSeen = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = rawArgs[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--") {
      continue;
    }
    if (argument.startsWith("-")) {
      const option = argument.split("=", 1)[0] ?? argument;
      if (isGlobalArgvFlag(argument)) {
        if (!argument.includes("=") && GLOBAL_ARGV_FLAGS_WITH_VALUE.has(option)) {
          index += 1;
        }
        continue;
      }
      if (!UPDATE_OPTIONS.has(option)) {
        throw new CliError(`Unknown option ${option}.`, {
          details: "Run altertable update --help for usage.",
        });
      }
      continue;
    }
    if (versionSeen) {
      throw new CliError(`Unexpected argument for altertable update: ${argument}.`, {
        details: "Pass at most one version; run altertable update --help for usage.",
      });
    }
    versionSeen = true;
  }
}

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

export const updateCommand = defineAltertableCommand({
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
  async run({ args, rawArgs, sink }) {
    validateUpdateArguments(rawArgs);
    await executeUpdateCommand(args as UpdateCommandArgs, sink);
  },
});
