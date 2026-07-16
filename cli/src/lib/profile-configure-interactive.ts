import {
  confirm as clackConfirm,
  isCancel,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { stdin as input, stderr as output } from "node:process";
import { configGet } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import { secretExists, secretGet } from "@/lib/secrets.ts";
import { type ConfigureOptions } from "@/lib/profile-configure-core.ts";
import {
  configureCredentialStatus,
  lakehousePlaneStatusDetail,
  managementPlaneStatusDetail,
} from "@/lib/profile/model.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { span } from "@/ui/document.ts";
import { ensurePromptColorAlignment, renderDisplayText } from "@/ui/terminal/styles.ts";

export type ConfigureWizardScope = "both" | "management" | "lakehouse";

export type ConfigureWizardOptions = {
  scope?: ConfigureWizardScope;
  profile?: string;
  org?: string;
  allowInsecureHttp?: boolean;
  prompts?: ConfigurePrompts;
  sink?: OutputSink;
};

export type ConfigureSelectOption = {
  value: string;
  label: string;
};

export type ConfigureReadSelectOptions = {
  leadingNewline?: boolean;
};

export type ConfigurePrompts = {
  writePrompt(line: string): void;
  readLine(prompt: string): Promise<string>;
  readPassword(prompt: string): Promise<string>;
  readSelect(
    title: string,
    options: ConfigureSelectOption[],
    defaultValue?: string,
    selectOptions?: ConfigureReadSelectOptions,
  ): Promise<string>;
  readConfirm(prompt: string, defaultYes?: boolean): Promise<boolean>;
};

export class ConfigurePromptCancelled extends CliError {
  constructor() {
    super("Configuration cancelled.");
  }
}

function writePromptLine(line: string): void {
  process.stderr.write(line);
}

async function readStdinLine(): Promise<string> {
  return await new Promise((resolve) => {
    let buffer = "";
    let settled = false;

    function settle(): void {
      if (settled) {
        return;
      }
      settled = true;
      input.off("data", onData);
      input.off("end", settle);
      resolve((buffer.split("\n")[0] ?? buffer).trim());
    }

    function onData(chunk: Buffer): void {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\n")) {
        settle();
      }
    }

    input.on("data", onData);
    input.on("end", settle);
    input.resume();
  });
}

async function readInteractiveLine(prompt: string): Promise<string> {
  if (!input.isTTY) {
    writePromptLine(prompt);
    return (await readStdinLine()).trim();
  }
  ensurePromptColorAlignment();
  const result = await clackText({
    message: normalizePromptMessage(prompt),
    input,
    output,
  });
  return resolvePromptResult(result);
}

async function readHiddenPassword(prompt: string): Promise<string> {
  if (!input.isTTY) {
    writePromptLine(prompt);
    return (await readStdinLine()).trim();
  }

  ensurePromptColorAlignment();
  const result = await clackPassword({
    message: normalizePromptMessage(prompt),
    input,
    output,
  });
  return resolvePromptResult(result);
}

function normalizePromptMessage(prompt: string): string {
  return prompt.trim().replace(/:\s*$/, "");
}

function resolvePromptResult(result: string | symbol): string {
  if (isCancel(result)) {
    throw new ConfigurePromptCancelled();
  }
  return result;
}

async function readSelect(
  title: string,
  options: ConfigureSelectOption[],
  defaultValue?: string,
  selectOptions: ConfigureReadSelectOptions = {},
): Promise<string> {
  if (options.length === 0) {
    throw new CliError("No options available.");
  }

  const leadingNewline = selectOptions.leadingNewline !== false ? "\n" : "";

  if (!input.isTTY) {
    throw new CliError("Interactive select requires a TTY.");
  }

  if (leadingNewline) {
    writePromptLine(leadingNewline);
  }

  ensurePromptColorAlignment();
  const result = await clackSelect({
    message: title,
    options: options.map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.value === defaultValue ? "default" : undefined,
    })),
    initialValue: defaultValue,
    input,
    output,
  });
  return resolvePromptResult(result);
}

async function readConfirm(prompt: string, defaultYes = true): Promise<boolean> {
  if (!input.isTTY) {
    const answer = (await readStdinLine()).trim().toLowerCase();
    if (answer === "") {
      return defaultYes;
    }
    return answer === "y" || answer === "yes";
  }

  ensurePromptColorAlignment();
  const result = await clackConfirm({
    message: normalizePromptMessage(prompt),
    initialValue: defaultYes,
    input,
    output,
  });
  if (isCancel(result)) {
    throw new ConfigurePromptCancelled();
  }
  return result;
}

export const defaultConfigurePrompts: ConfigurePrompts = {
  writePrompt: writePromptLine,
  readLine: readInteractiveLine,
  readPassword: readHiddenPassword,
  readSelect,
  readConfirm,
};

const DEFAULT_CONTROL_PLANE_URL = "https://app.altertable.ai";
const DEFAULT_DATA_PLANE_URL = "https://api.altertable.ai";
const DEFAULT_SCOPE: ConfigureWizardScope = "both";
const AUTO_PROFILE_NAME = "auto";

const HIDDEN_PROMPT_HINT = "(hidden)";
const SCOPE_SELECT_TITLE = "What to configure?";

const CONFIGURE_SCOPE_SELECT_OPTIONS = {
  leadingNewline: false,
};

type PromptScopeSelection = "management" | "lakehouse" | "both";

type ScopePromptModel = {
  defaultValue: PromptScopeSelection;
  options: ConfigureSelectOption[];
};

function formatScopeSelectLabel(plane: "management" | "lakehouse", profileName: string): string {
  const name = plane === "management" ? "Management" : "Lakehouse";
  const detail =
    plane === "management"
      ? managementPlaneStatusDetail(profileName)
      : lakehousePlaneStatusDetail(profileName);
  if (!detail) {
    return renderDisplayText([span(name, "strong"), span(" not set", "muted")]);
  }
  return renderDisplayText([span(name, "strong"), span(` ${detail}`, "subtle")]);
}

function toScopePromptOption(
  value: PromptScopeSelection,
  profileName: string,
): ConfigureSelectOption {
  if (value === "both") {
    return { value, label: renderDisplayText([span("Both", "strong")]) };
  }
  return { value, label: formatScopeSelectLabel(value, profileName) };
}

function buildScopePromptModel(
  hasManagement: boolean,
  hasLakehouse: boolean,
  profileName: string,
): ScopePromptModel {
  if (hasManagement && hasLakehouse) {
    return {
      defaultValue: "both",
      options: [
        toScopePromptOption("management", profileName),
        toScopePromptOption("lakehouse", profileName),
        toScopePromptOption("both", profileName),
      ],
    };
  }

  if (hasManagement) {
    return {
      defaultValue: "lakehouse",
      options: [
        toScopePromptOption("lakehouse", profileName),
        toScopePromptOption("management", profileName),
      ],
    };
  }

  if (hasLakehouse) {
    return {
      defaultValue: "management",
      options: [
        toScopePromptOption("management", profileName),
        toScopePromptOption("lakehouse", profileName),
      ],
    };
  }

  return {
    defaultValue: "both",
    options: [
      toScopePromptOption("both", profileName),
      toScopePromptOption("management", profileName),
      toScopePromptOption("lakehouse", profileName),
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
  profileName: string,
): Promise<ConfigureWizardScope> {
  const { hasManagement, hasLakehouse } = configureCredentialStatus(profileName);

  if (requestedScope !== DEFAULT_SCOPE) {
    return requestedScope;
  }

  const scopePromptModel = buildScopePromptModel(hasManagement, hasLakehouse, profileName);
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

async function readSecretWithOptionalReuse(
  args: ReadSecretWithOptionalReuseArgs,
  profileName: string,
): Promise<string> {
  const { prompts, secretKey, keepPrompt, passwordPrompt, requiredMessage } = args;
  if (secretExists(secretKey, profileName)) {
    const keepExistingValue = await prompts.readConfirm(keepPrompt, true);
    if (keepExistingValue) {
      return secretGet(secretKey, profileName);
    }
  }

  return await readRequiredPassword(prompts, passwordPrompt, requiredMessage);
}

export async function collectManagementCredentials(
  prompts: ConfigurePrompts,
  options: ConfigureWizardOptions,
  profileName: string,
): Promise<{ options: ConfigureOptions; org: string }> {
  prompts.writePrompt(`\n${renderDisplayText([span("Management", "accent")])}\n`);

  const currentEnv = configGet("api_key_env", profileName);
  const envDefault = currentEnv || "production";
  const envPrompt = renderDisplayText([
    span("Environment "),
    span(`[${envDefault}]`, "subtle"),
    span(": "),
  ]);
  const env = await readLineWithDefault(prompts, envPrompt, envDefault);
  let org = options.org ?? "";
  if (!org && options.profile === AUTO_PROFILE_NAME) {
    const currentOrg = configGet("organization_slug", profileName);
    const orgPrompt = currentOrg
      ? renderDisplayText([
          span("Organization slug "),
          span(`[${currentOrg}]`, "subtle"),
          span(": "),
        ])
      : renderDisplayText([span("Organization slug", "accent"), span(": ")]);
    org = currentOrg
      ? await readLineWithDefault(prompts, orgPrompt, currentOrg)
      : await prompts.readLine(orgPrompt);
    if (!org) {
      throw new CliError("Organization slug is required for --profile auto.");
    }
  }
  const apiKey = await readSecretWithOptionalReuse(
    {
      prompts,
      secretKey: "api-key",
      keepPrompt: "Keep existing API key?",
      passwordPrompt: renderDisplayText([
        span("API key", "accent"),
        span(` ${HIDDEN_PROMPT_HINT}`, "subtle"),
        span(": "),
      ]),
      requiredMessage: "API key is required.",
    },
    profileName,
  );

  const useDefaultControlPlane = await prompts.readConfirm(
    renderDisplayText([
      span("Default control plane "),
      span(DEFAULT_CONTROL_PLANE_URL, "accent", DEFAULT_CONTROL_PLANE_URL),
      span("?"),
    ]),
    true,
  );

  const configureOptions: ConfigureOptions = {
    apiKey,
    env,
    profile: options.profile,
    allowInsecureHttp: options.allowInsecureHttp,
  };

  if (!useDefaultControlPlane) {
    const controlPlaneUrl = await prompts.readLine(
      renderDisplayText([
        span("Control plane [", "subtle"),
        span(DEFAULT_CONTROL_PLANE_URL, "accent", DEFAULT_CONTROL_PLANE_URL),
        span("]: ", "subtle"),
      ]),
    );
    configureOptions.controlPlaneUrl = controlPlaneUrl || DEFAULT_CONTROL_PLANE_URL;
  }

  return { options: configureOptions, org };
}

export async function collectLakehouseCredentials(
  prompts: ConfigurePrompts,
  options: ConfigureWizardOptions,
  profileName: string,
): Promise<ConfigureOptions> {
  const method = await prompts.readSelect(
    renderDisplayText([span("Lakehouse", "accent"), span("  auth", "subtle")]),
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
      renderDisplayText([
        span("Basic token", "accent"),
        span(` ${HIDDEN_PROMPT_HINT}`, "subtle"),
        span(": "),
      ]),
      "Basic token is required.",
    );
    configureOptions.basicToken = basicToken;
    return configureOptions;
  }

  const currentUser = configGet("user", profileName);
  const userPrompt = currentUser
    ? renderDisplayText([span("Username "), span(`[${currentUser}]`, "subtle"), span(": ")])
    : renderDisplayText([span("Username", "accent"), span(": ")]);
  const user = currentUser
    ? await readLineWithDefault(prompts, userPrompt, currentUser)
    : await prompts.readLine(userPrompt);
  if (!user) {
    throw new CliError("Username is required.");
  }

  const password = await readSecretWithOptionalReuse(
    {
      prompts,
      secretKey: "lakehouse/password",
      keepPrompt: "Keep existing password?",
      passwordPrompt: renderDisplayText([
        span("Password", "accent"),
        span(` ${HIDDEN_PROMPT_HINT}`, "subtle"),
        span(": "),
      ]),
      requiredMessage: "Password is required.",
    },
    profileName,
  );

  const useDefaultDataPlane = await prompts.readConfirm(
    renderDisplayText([
      span("Default data plane "),
      span(DEFAULT_DATA_PLANE_URL, "accent", DEFAULT_DATA_PLANE_URL),
      span("?"),
    ]),
    true,
  );

  configureOptions.user = user;
  configureOptions.password = password;

  if (!useDefaultDataPlane) {
    const dataPlaneUrl = await prompts.readLine(
      renderDisplayText([
        span("Data plane [", "subtle"),
        span(DEFAULT_DATA_PLANE_URL, "accent", DEFAULT_DATA_PLANE_URL),
        span("]: ", "subtle"),
      ]),
    );
    configureOptions.dataPlaneUrl = dataPlaneUrl || DEFAULT_DATA_PLANE_URL;
  }

  return configureOptions;
}
