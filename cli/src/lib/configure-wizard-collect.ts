import { configGet } from "@/lib/config.ts";
import { type ConfigureOptions } from "@/lib/configure.ts";
import { type ConfigureSelectOption, type ConfigurePrompts } from "@/lib/configure-prompts.ts";
import {
  configureCredentialStatus,
  lakehousePlaneStatusDetail,
  managementPlaneStatusDetail,
} from "@/features/configure/model.ts";
import { CliError } from "@/lib/errors.ts";
import { secretExists, secretGet } from "@/lib/secrets.ts";
import type { ConfigureWizardOptions, ConfigureWizardScope } from "@/lib/configure-wizard-types.ts";
import {
  terminalAccent,
  terminalDefaultHint,
  terminalNotConfiguredStatus,
  terminalStrong,
  terminalSubtle,
  formatTerminalUrls,
} from "@/ui/terminal/styles.ts";

const DEFAULT_CONTROL_PLANE_URL = "https://app.altertable.ai";
const DEFAULT_DATA_PLANE_URL = "https://api.altertable.ai";
const DEFAULT_SCOPE: ConfigureWizardScope = "both";
const AUTO_PROFILE_NAME = "auto";

const HIDDEN_PROMPT_HINT = terminalSubtle("(hidden)");
const SCOPE_SELECT_TITLE = "What to configure?";

const CONFIGURE_SCOPE_SELECT_OPTIONS = {
  leadingNewline: false,
};

type PromptScopeSelection = "management" | "lakehouse" | "both";

type ScopePromptModel = {
  defaultValue: PromptScopeSelection;
  options: ConfigureSelectOption[];
};

function formatScopeSelectLabel(plane: "management" | "lakehouse"): string {
  const name = plane === "management" ? "Management" : "Lakehouse";
  const detail =
    plane === "management" ? managementPlaneStatusDetail() : lakehousePlaneStatusDetail();
  if (!detail) {
    return `${terminalStrong(name)} ${terminalNotConfiguredStatus()}`;
  }
  return `${terminalStrong(name)} ${terminalSubtle(detail)}`;
}

function toScopePromptOption(value: PromptScopeSelection): ConfigureSelectOption {
  if (value === "both") {
    return { value, label: terminalStrong("Both") };
  }
  return { value, label: formatScopeSelectLabel(value) };
}

function buildScopePromptModel(hasManagement: boolean, hasLakehouse: boolean): ScopePromptModel {
  if (hasManagement && hasLakehouse) {
    return {
      defaultValue: "both",
      options: [
        toScopePromptOption("management"),
        toScopePromptOption("lakehouse"),
        toScopePromptOption("both"),
      ],
    };
  }

  if (hasManagement) {
    return {
      defaultValue: "lakehouse",
      options: [toScopePromptOption("lakehouse"), toScopePromptOption("management")],
    };
  }

  if (hasLakehouse) {
    return {
      defaultValue: "management",
      options: [toScopePromptOption("management"), toScopePromptOption("lakehouse")],
    };
  }

  return {
    defaultValue: "both",
    options: [
      toScopePromptOption("both"),
      toScopePromptOption("management"),
      toScopePromptOption("lakehouse"),
    ],
  };
}

function parseScopeSelection(selection: string): ConfigureWizardScope {
  if (selection === "management" || selection === "lakehouse" || selection === "both") {
    return selection;
  }
  throw new CliError(`Unexpected scope selection: ${selection}`);
}

export async function promptConfigureScope(
  prompts: ConfigurePrompts,
  requestedScope: ConfigureWizardScope,
): Promise<ConfigureWizardScope> {
  const { hasManagement, hasLakehouse } = configureCredentialStatus();

  if (requestedScope !== DEFAULT_SCOPE) {
    return requestedScope;
  }

  const scopePromptModel = buildScopePromptModel(hasManagement, hasLakehouse);
  const selectedScope = await prompts.readSelect(
    SCOPE_SELECT_TITLE,
    scopePromptModel.options,
    scopePromptModel.defaultValue,
    CONFIGURE_SCOPE_SELECT_OPTIONS,
  );
  return parseScopeSelection(selectedScope);
}

export function planesForConfigureScope(
  scope: ConfigureWizardScope,
): ("management" | "lakehouse")[] {
  if (scope === "management") {
    return ["management"];
  }
  if (scope === "lakehouse") {
    return ["lakehouse"];
  }
  return ["management", "lakehouse"];
}

async function readLineWithDefault(
  prompts: ConfigurePrompts,
  prompt: string,
  defaultValue: string,
): Promise<string> {
  const response = await prompts.readLine(prompt);
  return response || defaultValue;
}

async function readRequiredPassword(
  prompts: ConfigurePrompts,
  prompt: string,
  requiredMessage: string,
): Promise<string> {
  const password = await prompts.readPassword(prompt);
  if (!password) {
    throw new CliError(requiredMessage);
  }
  return password;
}

type ReadSecretWithOptionalReuseArgs = {
  prompts: ConfigurePrompts;
  secretKey: string;
  keepPrompt: string;
  passwordPrompt: string;
  requiredMessage: string;
};

async function readSecretWithOptionalReuse(args: ReadSecretWithOptionalReuseArgs): Promise<string> {
  const { prompts, secretKey, keepPrompt, passwordPrompt, requiredMessage } = args;
  if (secretExists(secretKey)) {
    const keepExistingValue = await prompts.readConfirm(keepPrompt, true);
    if (keepExistingValue) {
      return secretGet(secretKey);
    }
  }

  return await readRequiredPassword(prompts, passwordPrompt, requiredMessage);
}

export async function collectManagementCredentials(
  prompts: ConfigurePrompts,
  options: ConfigureWizardOptions,
): Promise<ConfigureOptions> {
  prompts.writePrompt(`\n${terminalAccent("Management")}\n`);

  const currentEnv = configGet("api_key_env");
  const envDefault = currentEnv || "production";
  const envPrompt = `Environment ${terminalDefaultHint(envDefault)}: `;
  const env = await readLineWithDefault(prompts, envPrompt, envDefault);
  let org = options.org ?? "";
  if (!org && options.profile === AUTO_PROFILE_NAME) {
    const currentOrg = configGet("organization_slug");
    const orgPrompt = currentOrg
      ? `Organization slug ${terminalDefaultHint(currentOrg)}: `
      : `${terminalAccent("Organization slug")}: `;
    org = currentOrg
      ? await readLineWithDefault(prompts, orgPrompt, currentOrg)
      : await prompts.readLine(orgPrompt);
    if (!org) {
      throw new CliError("Organization slug is required for --profile auto.");
    }
  }
  const apiKey = await readSecretWithOptionalReuse({
    prompts,
    secretKey: "api-key",
    keepPrompt: "Keep existing API key?",
    passwordPrompt: `${terminalAccent("API key")} ${HIDDEN_PROMPT_HINT}: `,
    requiredMessage: "API key is required.",
  });

  const useDefaultControlPlane = await prompts.readConfirm(
    `Default control plane ${formatTerminalUrls(DEFAULT_CONTROL_PLANE_URL)}?`,
    true,
  );

  const configureOptions: ConfigureOptions = {
    apiKey,
    env,
    org,
    profile: options.profile,
    allowInsecureHttp: options.allowInsecureHttp,
  };

  if (!useDefaultControlPlane) {
    const controlPlaneUrl = await prompts.readLine(
      `Control plane ${terminalDefaultHint(formatTerminalUrls(DEFAULT_CONTROL_PLANE_URL))}: `,
    );
    configureOptions.controlPlaneUrl = controlPlaneUrl || DEFAULT_CONTROL_PLANE_URL;
  }

  return configureOptions;
}

export async function collectLakehouseCredentials(
  prompts: ConfigurePrompts,
  options: ConfigureWizardOptions,
): Promise<ConfigureOptions> {
  const method = await prompts.readSelect(
    `${terminalAccent("Lakehouse")}  ${terminalSubtle("auth")}`,
    [
      { value: "user-password", label: "Username and password" },
      { value: "basic-token", label: "Basic token" },
    ],
    "user-password",
  );

  const configureOptions: ConfigureOptions = {
    profile: options.profile,
    allowInsecureHttp: options.allowInsecureHttp,
  };

  if (method === "basic-token") {
    const basicToken = await readRequiredPassword(
      prompts,
      `${terminalAccent("Basic token")} ${HIDDEN_PROMPT_HINT}: `,
      "Basic token is required.",
    );
    configureOptions.basicToken = basicToken;
    return configureOptions;
  }

  const currentUser = configGet("user");
  const userPrompt = currentUser
    ? `Username ${terminalDefaultHint(currentUser)}: `
    : `${terminalAccent("Username")}: `;
  const user = currentUser
    ? await readLineWithDefault(prompts, userPrompt, currentUser)
    : await prompts.readLine(userPrompt);
  if (!user) {
    throw new CliError("Username is required.");
  }

  const password = await readSecretWithOptionalReuse({
    prompts,
    secretKey: "lakehouse/password",
    keepPrompt: "Keep existing password?",
    passwordPrompt: `${terminalAccent("Password")} ${HIDDEN_PROMPT_HINT}: `,
    requiredMessage: "Password is required.",
  });

  const useDefaultDataPlane = await prompts.readConfirm(
    `Default data plane ${formatTerminalUrls(DEFAULT_DATA_PLANE_URL)}?`,
    true,
  );

  configureOptions.user = user;
  configureOptions.password = password;

  if (!useDefaultDataPlane) {
    const dataPlaneUrl = await prompts.readLine(
      `Data plane ${terminalDefaultHint(formatTerminalUrls(DEFAULT_DATA_PLANE_URL))}: `,
    );
    configureOptions.dataPlaneUrl = dataPlaneUrl || DEFAULT_DATA_PLANE_URL;
  }

  return configureOptions;
}
