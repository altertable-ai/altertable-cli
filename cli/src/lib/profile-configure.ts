import type { ArgsDef } from "citty";
import {
  configureRunSet,
  withConfigureProfileContext,
  type ConfigureOptions,
} from "@/lib/profile-configure-core.ts";
import { formatConfigureSessionSummary } from "@/features/profile/render.ts";
import type { ConfigureAuthPlane } from "@/lib/profile-status.ts";
import { ConfigurationError, CliError } from "@/lib/errors.ts";
import { getCliContext, isJsonOutput } from "@/context.ts";
import { resolveWorkingProfile } from "@/lib/profile-store.ts";
import { getOutputSink, type OutputSink } from "@/lib/runtime.ts";
import {
  collectLakehouseCredentials,
  collectManagementCredentials,
  ConfigurePromptCancelled,
  defaultConfigurePrompts,
  planesForConfigureScope,
  promptConfigureScope,
  type ConfigureWizardOptions,
  type ConfigureWizardScope,
} from "@/lib/profile-configure-interactive.ts";
import { getTerminalWidth, getVisibleTextWidth, renderDisplayText } from "@/ui/terminal/styles.ts";
import { deriveProfileName } from "@/features/profile/model.ts";
import { document, section, span, text, type DisplayText } from "@/ui/document.ts";
import { renderDocumentText } from "@/ui/renderers/terminal.ts";

const DEFAULT_SCOPE: ConfigureWizardScope = "both";
const AUTO_PROFILE_NAME = "auto";

async function saveCredentials(
  configureOptions: ConfigureOptions,
  sink: OutputSink,
  org = "",
): Promise<void> {
  await configureRunSet({ ...configureOptions, interactive: true }, sink, org);
}

function formatNextCommandsLine(commands: DisplayText[]): string {
  if (commands.length === 0) {
    return "";
  }

  const terminalWidth = getTerminalWidth();
  const inlineLines: DisplayText[] = [[span("Next:", "muted")], ...commands];
  const inlineLine = renderDocumentText(document(section(text(inlineLines))));
  if (getVisibleTextWidth(inlineLine) <= terminalWidth) {
    return inlineLine;
  }

  return renderDocumentText(
    document(
      section(
        text([
          [span("Next:", "muted")],
          ...commands.map((command) => [
            span("  "),
            ...(typeof command === "string" ? [span(command)] : command),
          ]),
        ]),
      ),
    ),
  );
}

function writeOutro(
  sink: OutputSink,
  configuredPlanes: ConfigureAuthPlane[],
  profileName: string,
): void {
  const summaryLines = formatConfigureSessionSummary(profileName, configuredPlanes);
  const nextCommands: DisplayText[] = [];

  if (configuredPlanes.includes("management")) {
    nextCommands.push([span("altertable profile show", "accent")]);
  }
  if (configuredPlanes.includes("lakehouse")) {
    nextCommands.push([span('altertable query "SELECT 1"', "accent")]);
  }

  const nextLine = formatNextCommandsLine(nextCommands);
  sink.writeMetadata(["", ...summaryLines, "", nextLine, ""]);
}

export function configureNonTtyErrorMessage(): string {
  return (
    "Interactive configure requires a TTY. Examples:\n" +
    "  altertable profile --configure --api-key atm_xxx --env production\n" +
    "  printf '%s' \"$PASS\" | altertable profile --configure --user alice --password-stdin"
  );
}

async function runConfigureWizardInCurrentProfile(
  options: ConfigureWizardOptions,
  profileName: string,
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
    const scope = await promptConfigureScope(prompts, options.scope ?? DEFAULT_SCOPE, profileName);
    const planes = planesForConfigureScope(scope);
    const configuredPlanes: ConfigureAuthPlane[] = [];
    let activeProfile = options.profile;
    // The profile actually written to; for `--profile auto` it is only known once
    // the org/env are collected, so it starts as the read profile and is updated.
    let targetProfile = profileName;

    if (activeProfile === AUTO_PROFILE_NAME && !planes.includes("management")) {
      throw new CliError(
        "--profile auto requires management configuration so the environment is known.",
      );
    }

    if (planes.includes("management")) {
      const { options: managementOptions, org } = await collectManagementCredentials(
        prompts,
        { ...options, profile: activeProfile },
        targetProfile,
      );
      await saveCredentials(managementOptions, sink, org);
      if (activeProfile === AUTO_PROFILE_NAME && org && managementOptions.env) {
        activeProfile = deriveProfileName(org, managementOptions.env);
        targetProfile = activeProfile;
      }
      configuredPlanes.push("management");
    }

    if (planes.includes("lakehouse")) {
      const lakehouseOptions = await collectLakehouseCredentials(
        prompts,
        { ...options, profile: activeProfile },
        targetProfile,
      );
      await saveCredentials(lakehouseOptions, sink);
      configuredPlanes.push("lakehouse");
    }

    writeOutro(sink, configuredPlanes, targetProfile);
  } catch (error) {
    if (error instanceof ConfigurePromptCancelled) {
      sink.writeMetadata([renderDisplayText([span("Configuration cancelled.", "subtle")])]);
      throw error;
    }
    throw error;
  }
}

export async function runConfigureWizard(options: ConfigureWizardOptions = {}): Promise<void> {
  const contextProfile =
    options.profile && options.profile !== AUTO_PROFILE_NAME
      ? options.profile
      : resolveWorkingProfile(getCliContext().profile);
  await withConfigureProfileContext(contextProfile, async (profileName) => {
    await runConfigureWizardInCurrentProfile(options, profileName);
  });
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

export type ConfigureCommandArgs = {
  user?: string;
  password?: string;
  "basic-token"?: string;
  "api-key"?: string;
  env?: string;
  "password-stdin"?: boolean;
  "api-key-stdin"?: boolean;
  "data-plane-url"?: string;
  "control-plane-url"?: string;
  "allow-insecure-http"?: boolean;
  scope?: string;
};

/** Credential/endpoint flags shared by `profile --configure`; spread into the profile command args. */
export const configureArgs = {
  user: { type: "string", description: "Lakehouse username (global)" },
  password: { type: "string", description: "Lakehouse password (global)" },
  "basic-token": { type: "string", description: "Pre-encoded HTTP Basic token" },
  "api-key": { type: "string", description: "Management API key for the --env environment" },
  env: {
    type: "string",
    description: "Target environment (management API keys are per-environment)",
  },
  "password-stdin": { type: "boolean", description: "Read the lakehouse password from stdin" },
  "api-key-stdin": { type: "boolean", description: "Read the management API key from stdin" },
  "data-plane-url": {
    type: "string",
    description:
      "Data-plane base URL; can be set alone or with a credential (default: https://api.altertable.ai)",
  },
  "control-plane-url": {
    type: "string",
    description:
      "Control-plane server root; the CLI appends /rest/v1 (default: https://app.altertable.ai)",
  },
  "allow-insecure-http": {
    type: "boolean",
    description: "Allow http:// URLs other than localhost (not recommended)",
  },
  scope: {
    type: "enum",
    options: ["management", "lakehouse"],
    description: "Limit the interactive wizard to one plane (default: both)",
  },
} satisfies ArgsDef;

function buildConfigureOptions(args: ConfigureCommandArgs): ConfigureOptions {
  return {
    user: args.user,
    password: args.password,
    basicToken: args["basic-token"],
    apiKey: args["api-key"],
    env: args.env,
    passwordStdin: args["password-stdin"],
    apiKeyStdin: args["api-key-stdin"],
    dataPlaneUrl: args["data-plane-url"],
    controlPlaneUrl: args["control-plane-url"],
    allowInsecureHttp: args["allow-insecure-http"],
  };
}

function resolveWizardScope(scope: string | undefined): ConfigureWizardScope {
  if (scope === "management" || scope === "lakehouse" || scope === "both") {
    return scope;
  }
  if (!scope) {
    return "both";
  }
  throw new CliError(`Invalid --scope "${scope}". Use management or lakehouse.`);
}

/**
 * Apply `profile --configure`: non-interactive when credential/endpoint flags are
 * present, otherwise the interactive wizard (optionally scoped to one plane).
 * Verification is not part of configure; use `altertable profile status`.
 */
export async function runProfileConfigure(
  args: ConfigureCommandArgs,
  sink: OutputSink,
  profileName?: string,
): Promise<void> {
  const options = buildConfigureOptions(args);
  if (profileName) {
    options.profile = profileName;
  }

  if (hasConfigureCredentialFlags(options)) {
    if (args.scope) {
      throw new CliError(
        "--scope only applies to the interactive wizard, not flag-based configure.",
      );
    }
    await configureRunSet(options, sink);
    return;
  }

  await runConfigureWizard({
    scope: resolveWizardScope(args.scope),
    allowInsecureHttp: options.allowInsecureHttp,
    profile: profileName,
    sink,
  });
}
