import {
  configureRunSet,
  withConfigureProfileContext,
  type ConfigureOptions,
} from "@/lib/configure.ts";
import { ConfigurePromptCancelled, defaultConfigurePrompts } from "@/lib/configure-prompts.ts";
import { formatConfigureSessionSummary } from "@/lib/configure-credential-status.ts";
import {
  configureVerify,
  formatConfigureVerifyRemediation,
  type ConfigureAuthPlane,
  type ConfigureVerifyResult,
} from "@/lib/configure-verify.ts";
import { ConfigurationError, CliError, EXIT_CONFIG } from "@/lib/errors.ts";
import { getCliContext, isJsonOutput } from "@/context.ts";
import { getOutputSink, type OutputSink } from "@/lib/runtime.ts";
import {
  collectLakehouseCredentials,
  collectManagementCredentials,
  planesForConfigureScope,
  promptConfigureScope,
} from "@/lib/configure-wizard-collect.ts";
import type { ConfigureWizardOptions, ConfigureWizardScope } from "@/lib/configure-wizard-types.ts";
import {
  terminalAccent,
  terminalMetadata,
  terminalMuted,
  getTerminalWidth,
  getVisibleTextWidth,
} from "@/lib/terminal-style.ts";

export type { ConfigurePlaneStatusOptions } from "@/lib/configure-wizard-status.ts";
export type { ConfigureWizardOptions, ConfigureWizardScope } from "@/lib/configure-wizard-types.ts";
export { formatConfigurePlaneStatusLine } from "@/lib/configure-wizard-status.ts";

const DEFAULT_SCOPE: ConfigureWizardScope = "both";

async function saveCredentials(
  configureOptions: ConfigureOptions,
  sink: OutputSink,
): Promise<void> {
  await configureRunSet({ ...configureOptions, interactive: true }, sink);
}

function formatNextCommandsLine(commands: string[]): string {
  if (commands.length === 0) {
    return "";
  }

  const terminalWidth = getTerminalWidth();
  const inlinePrefix = `${terminalMuted("Next:")}\n`;
  const inlineLine = inlinePrefix + commands.join("\n");
  if (getVisibleTextWidth(inlineLine) <= terminalWidth) {
    return inlineLine;
  }

  return `${terminalMuted("Next:")}\n${commands.map((command) => `  ${command}`).join("\n")}`;
}

function writeOutro(sink: OutputSink, configuredPlanes: ConfigureAuthPlane[]): void {
  const summaryLines = formatConfigureSessionSummary(configuredPlanes);
  const nextCommands: string[] = [];

  if (configuredPlanes.includes("management")) {
    nextCommands.push(terminalAccent("altertable context"));
  }
  if (configuredPlanes.includes("lakehouse")) {
    nextCommands.push(terminalAccent('altertable query --statement "SELECT 1"'));
  }

  const nextLine = formatNextCommandsLine(nextCommands);
  sink.writeMetadata(["", ...summaryLines, "", nextLine, ""]);
}

async function resolveVerifyPreference(
  prompts: NonNullable<ConfigureWizardOptions["prompts"]>,
  options: ConfigureWizardOptions,
): Promise<boolean> {
  if (options.noVerify) {
    return false;
  }
  if (options.verify) {
    return true;
  }
  return await prompts.readConfirm("Verify credentials?", true);
}

function throwVerifyFailure(result: ConfigureVerifyResult): void {
  const lines = result.errors.map(
    (error) => `${error.plane}: ${error.message}. ${formatConfigureVerifyRemediation(error.plane)}`,
  );
  throw new CliError(lines.join("\n"), { exitCode: EXIT_CONFIG });
}

export function configureNonTtyErrorMessage(): string {
  return (
    "Interactive configure requires a TTY. Examples:\n" +
    "  altertable configure --api-key atm_xxx --env production\n" +
    "  printf '%s' \"$PASS\" | altertable configure --user alice --password-stdin"
  );
}

async function runConfigureWizardInCurrentProfile(
  options: ConfigureWizardOptions = {},
): Promise<void> {
  const sink = options.sink ?? getOutputSink();
  const prompts = options.prompts ?? defaultConfigurePrompts;

  if (isJsonOutput(getCliContext())) {
    throw new ConfigurationError(
      "Interactive configure does not support --json or --agent. Use credential flags instead.",
    );
  }

  if (!process.stdin.isTTY) {
    throw new ConfigurationError(configureNonTtyErrorMessage());
  }

  try {
    const scope = await promptConfigureScope(prompts, options.scope ?? DEFAULT_SCOPE);
    const planes = planesForConfigureScope(scope);
    const configuredPlanes: ConfigureAuthPlane[] = [];

    if (planes.includes("management")) {
      const managementOptions = await collectManagementCredentials(prompts, options);
      await saveCredentials(managementOptions, sink);
      configuredPlanes.push("management");
    }

    if (planes.includes("lakehouse")) {
      const lakehouseOptions = await collectLakehouseCredentials(prompts, options);
      await saveCredentials(lakehouseOptions, sink);
      configuredPlanes.push("lakehouse");
    }

    const shouldVerify = await resolveVerifyPreference(prompts, options);
    if (shouldVerify) {
      const verifyResult = await configureVerify(configuredPlanes);
      if (verifyResult.errors.length > 0) {
        throwVerifyFailure(verifyResult);
      }
    }

    writeOutro(sink, configuredPlanes);
  } catch (error) {
    if (error instanceof ConfigurePromptCancelled) {
      sink.writeMetadata([terminalMetadata("Configuration cancelled.")]);
      throw error;
    }
    throw error;
  }
}

export async function runConfigureWizard(options: ConfigureWizardOptions = {}): Promise<void> {
  await withConfigureProfileContext(options.profile, async () => {
    await runConfigureWizardInCurrentProfile(options);
  });
}

export type ConfigureFlagVerifyOptions = {
  verify?: boolean;
  configuredPlanes: ConfigureAuthPlane[];
  sink: OutputSink;
};

export async function configureRunVerifyIfRequested(
  options: ConfigureFlagVerifyOptions,
): Promise<ConfigureVerifyResult | undefined> {
  if (!options.verify) {
    return undefined;
  }

  const result = await configureVerify(options.configuredPlanes);
  if (options.sink.json) {
    options.sink.writeJson(result);
  }

  if (result.errors.length > 0) {
    throwVerifyFailure(result);
  }

  return result;
}

export function configuredPlanesFromOptions(options: ConfigureOptions): ConfigureAuthPlane[] {
  const planes: ConfigureAuthPlane[] = [];
  const hasLakehouse = Boolean(
    options.user || options.password || options.basicToken || options.passwordStdin,
  );
  const hasApiKey = Boolean(options.apiKey || options.apiKeyStdin);
  if (hasApiKey) {
    planes.push("management");
  }
  if (hasLakehouse) {
    planes.push("lakehouse");
  }
  return planes;
}

export function hasConfigureCredentialFlags(options: ConfigureOptions): boolean {
  return (
    Boolean(options.user) ||
    Boolean(options.password) ||
    Boolean(options.basicToken) ||
    Boolean(options.apiKey) ||
    Boolean(options.env) ||
    Boolean(options.passwordStdin) ||
    Boolean(options.apiKeyStdin) ||
    Boolean(options.dataPlaneUrl) ||
    Boolean(options.controlPlaneUrl)
  );
}
