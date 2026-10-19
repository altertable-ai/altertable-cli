import { CLI_PACKAGE_METADATA } from '@/package-metadata.ts';
import { span } from '@/ui/document.ts';
import { renderDisplayText } from '@/ui/terminal/styles.ts';
import { VERSION } from '@/version.ts';
import { asCliArgString } from '@/lib/cli-args.ts';
import { writeCommandOutput } from '@/lib/command-output.ts';
import { defineCommand } from '@/lib/command.ts';
import { CliError } from '@/lib/errors.ts';
import type { OutputSink } from '@/lib/runtime.ts';
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
} from '@/lib/updater.ts';

export const updateCommand = defineCommand({
  metadata: {
    name: 'update',
    alias: ['upgrade'],
    commandGroup: 'platform',
    description: 'Update Altertable CLI to the latest release.',
    examples: [
      'altertable update',
      'altertable update --check',
      'altertable update 1.2.0 --force',
    ],
  },
  args: {
    version: {
      type: 'positional',
      description: 'Specific version to install (default: latest).',
      required: false,
    },
    check: {
      type: 'boolean',
      description: 'Check for an update without installing it.',
    },
    force: {
      type: 'boolean',
      description: 'Reinstall or downgrade to the selected release.',
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

const DEFAULT_DEPENDENCIES: UpdateCommandDependencies = {
  checkForUpdate,
  installCliUpdate,
};

function buildTargetResult(targetVersion: string): UpdateCheckResult {
  const version = normalizeVersion(targetVersion);
  if (!isValidVersion(version)) {
    throw new CliError(`Invalid update version: ${targetVersion}.`, {
      details: 'Expected a semantic version such as 1.2.0 or 1.3.0-rc.1.',
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
  sink: OutputSink
): Promise<void> {
  await writeCommandOutput(
    {
      kind: 'normalized',
      data: result,
      humanText: formatUpdateResult(result, targetVersion),
    },
    sink
  );
}

export async function executeUpdateCommand(
  args: UpdateCommandArgs,
  sink: OutputSink,
  dependencies: UpdateCommandDependencies = DEFAULT_DEPENDENCIES
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
    throw new CliError(
      `Target version v${result.latest_version} is older than v${VERSION}.`
    );
  }
  if (!args.force && !result.update_available) {
    await writeUpdateCheck(result, targetVersion, sink);
    return;
  }

  if (!sink.json) {
    sink.writeMetadata([formatUpdateAnnouncement(result)]);
  }
  const installed = await dependencies.installCliUpdate(result.latest_version, {
    stdio: sink.json ? 'pipe' : 'inherit',
  });
  await writeCommandOutput(
    {
      kind: 'normalized',
      data: installed,
      humanText: formatInstalledUpdate(result, installed.verified_version),
    },
    sink
  );
}

function formatUpdateAnnouncement(result: UpdateCheckResult): string {
  if (result.update_available) {
    return renderDisplayText([
      span('Altertable CLI ', 'strong'),
      span(`v${result.latest_version}`, 'accent'),
      span(" is out! You're on "),
      span(`v${result.current_version}`, 'string'),
    ]);
  }

  if (compareVersions(result.latest_version, result.current_version) === 0) {
    return renderDisplayText([
      span('Reinstalling Altertable CLI ', 'strong'),
      span(`v${result.current_version}`, 'accent'),
      span('.'),
    ]);
  }

  return renderDisplayText([
    span('Downgrading Altertable CLI to ', 'strong'),
    span(`v${result.latest_version}`, 'accent'),
    span(". You're on "),
    span(`v${result.current_version}`, 'string'),
  ]);
}

function formatInstalledUpdate(
  result: UpdateCheckResult,
  installedVersion: string
): string {
  const repositoryUrl = `https://github.com/${CLI_PACKAGE_METADATA.repositorySlug}`;
  const version = `v${normalizeVersion(installedVersion)}`;
  const currentVersion = `v${normalizeVersion(result.current_version)}`;
  const comparison = compareVersions(installedVersion, result.current_version);
  let outcome = 'Reinstalled.';
  if (comparison > 0) {
    outcome = 'Upgraded.';
  } else if (comparison < 0) {
    outcome = 'Downgraded.';
  }
  const lines = [
    outcome,
    '',
    `Release notes for Altertable CLI ${version}:`,
    '',
    renderDisplayText([
      span(`  ${repositoryUrl}/releases/tag/${version}`, 'accent'),
    ]),
    '',
    'Report any bugs:',
    '',
    `  ${repositoryUrl}/issues`,
  ];
  if (comparison !== 0) {
    lines.push(
      '',
      'Commit log:',
      '',
      `  ${repositoryUrl}/compare/${currentVersion}...${version}`
    );
  }
  return lines.join('\n');
}
