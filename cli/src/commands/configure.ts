import {
  configureRunClear,
  configureRunSet,
  configureRunShow,
  buildConfigureShowDataForProfile,
  type ConfigureOptions,
} from "@/lib/configure.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { localPlan } from "@/lib/operation-effect.ts";
import {
  configuredPlanesFromOptions,
  configureRunVerifyIfRequested,
  type ConfigureWizardScope,
  hasConfigureCredentialFlags,
  runConfigureWizard,
} from "@/lib/configure-wizard.ts";
import type { OutputSink } from "@/lib/runtime.ts";

type ConfigureCommandArgs = {
  user?: string;
  password?: string;
  "basic-token"?: string;
  "api-key"?: string;
  env?: string;
  "password-stdin"?: boolean;
  "api-key-stdin"?: boolean;
  show?: boolean;
  clear?: boolean;
  profile?: string;
  "data-plane-url"?: string;
  "control-plane-url"?: string;
  "allow-insecure-http"?: boolean;
  verify?: boolean;
  "no-verify"?: boolean;
};

const configurePlaneArgs = {
  profile: {
    type: "string",
    description: "Profile to configure (default: active profile)",
  },
  verify: { type: "boolean", description: "Verify credentials after saving" },
  "no-verify": { type: "boolean", description: "Skip verification" },
  "allow-insecure-http": {
    type: "boolean",
    description: "Allow http:// URLs other than localhost (not recommended)",
  },
} as const;

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
    profile: args.profile ? String(args.profile) : undefined,
    allowInsecureHttp: args["allow-insecure-http"],
    verify: args.verify,
  };
}

async function runConfigureFromFlags(options: ConfigureOptions, sink: OutputSink): Promise<void> {
  await configureRunSet(options, sink);

  const configuredPlanes = configuredPlanesFromOptions(options);
  await configureRunVerifyIfRequested({
    verify: options.verify,
    configuredPlanes,
    sink,
  });
}

async function runConfigureWizardFromArgs(
  scope: ConfigureWizardScope,
  args: ConfigureCommandArgs,
  sink: OutputSink,
): Promise<void> {
  const options = buildConfigureOptions(args);
  await runConfigureWizard({
    scope,
    profile: options.profile,
    verify: args.verify,
    noVerify: args["no-verify"],
    allowInsecureHttp: options.allowInsecureHttp,
    sink,
  });
}

async function runConfigureDispatch(args: ConfigureCommandArgs, sink: OutputSink): Promise<void> {
  if (args.show) {
    const configuration = buildConfigureShowDataForProfile();
    writeCommandOutput(
      {
        kind: "normalized",
        data: { configuration },
        humanText: configureRunShow(),
      },
      sink,
    );
    return;
  }
  if (args.clear) {
    configureRunClear(sink);
    return;
  }

  const options = buildConfigureOptions(args);

  if (hasConfigureCredentialFlags(options)) {
    await runConfigureFromFlags(options, sink);
    return;
  }

  await runConfigureWizardFromArgs("both", args, sink);
}

function createConfigurePlaneCommand(
  scope: Exclude<ConfigureWizardScope, "both">,
  description: string,
) {
  return defineOperationCommand({
    id: `configure.${scope}`,
    capabilities: ["local-config", "local-file-write"],
    catalog: { effects: ["local"], mutates: true, output: "none" },
    meta: { name: scope, description },
    args: configurePlaneArgs,
    parse({ args }) {
      return args;
    },
    run(args) {
      return localPlan(async ({ sink }) => {
        await runConfigureWizardFromArgs(scope, args, sink);
      });
    },
  });
}

const configureManagementCommand = createConfigurePlaneCommand(
  "management",
  "Interactively configure management API credentials.",
);

const configureLakehouseCommand = createConfigurePlaneCommand(
  "lakehouse",
  "Interactively configure lakehouse credentials.",
);

export const configureCommand = defineOperationCommand({
  id: "configure",
  capabilities: ["local-config", "local-file-write"],
  catalog: { effects: ["local"], mutates: true, output: "none" },
  meta: {
    name: "configure",
    description: "Configure and securely store credentials and settings.",
    examples: [
      "altertable configure",
      "altertable configure --show",
      "altertable configure --api-key atm_xxxx --env production",
      "altertable configure management",
    ],
  },
  args: {
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
    show: { type: "boolean", description: "Show stored configuration (secrets masked)" },
    profile: {
      type: "string",
      description: "Profile to configure (default: active profile)",
    },
    clear: {
      type: "boolean",
      description: "Remove all stored configuration and credentials (no prompt)",
    },
    "data-plane-url": {
      type: "string",
      description:
        "Data-plane base URL (stored with the credential; default: https://api.altertable.ai)",
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
    verify: {
      type: "boolean",
      description: "Verify credentials after saving (flag-based configure; opt-in)",
    },
    "no-verify": {
      type: "boolean",
      description:
        "Skip verification in the interactive wizard (ignored with flag-based configure)",
    },
  },
  subCommands: {
    management: configureManagementCommand,
    lakehouse: configureLakehouseCommand,
  },
  parse({ args }) {
    return args;
  },
  run(args) {
    return localPlan(async ({ sink }) => {
      await runConfigureDispatch(args, sink);
    });
  },
});
