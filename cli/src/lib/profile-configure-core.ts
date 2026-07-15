import { unlinkSync, rmSync, existsSync } from "node:fs";
import { configFile, configGet, configSet, credentialsFile, kvUnset } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import { deriveProfileName, listProfiles } from "@/features/profile/model.ts";
import {
  ensureProfileExists,
  profileConfigFile,
  profilesDir,
  resolveWorkingProfile,
} from "@/lib/profile-store.ts";
import { getCliContext } from "@/context.ts";
import { secretDelete, secretSet } from "@/lib/secrets.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { getCliRuntime, getOutputSink, type OutputSink } from "@/lib/runtime.ts";
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

const ARGV_SECRET_WARNING =
  "Warning: passing secrets on the command line is visible in process listings. Prefer --password-stdin / --api-key-stdin.";

export type ConfigureOptions = {
  user?: string;
  password?: string;
  basicToken?: string;
  apiKey?: string;
  env?: string;
  passwordStdin?: boolean;
  apiKeyStdin?: boolean;
  dataPlaneUrl?: string;
  controlPlaneUrl?: string;
  profile?: string;
  show?: boolean;
  clear?: boolean;
  allowInsecureHttp?: boolean;
  /** Secrets collected via the interactive wizard (not CLI flags). */
  interactive?: boolean;
};

const AUTO_PROFILE_NAME = "auto";

function markCurrentProfileUpdated(profileName: string): void {
  const timestamp = new Date().toISOString();
  if (!configGet("created_at", profileName)) {
    configSet("created_at", timestamp, profileName);
  }
  configSet("updated_at", timestamp, profileName);
}

function clearProfileEndpoint(key: "api_base" | "management_api_base", profileName: string): void {
  kvUnset(profileConfigFile(profileName), key);
}

function resolveConfigureProfile(options: ConfigureOptions, org: string): string {
  const explicitProfile = options.profile;
  const env = options.env ?? "";

  if (explicitProfile && explicitProfile !== AUTO_PROFILE_NAME) {
    return explicitProfile;
  }
  if (explicitProfile === AUTO_PROFILE_NAME && options.interactive && org && env) {
    return deriveProfileName(org, env);
  }
  if (explicitProfile === AUTO_PROFILE_NAME) {
    throw new CliError("--profile auto is only supported by interactive configure.");
  }
  return resolveWorkingProfile(getCliContext().profile);
}

export async function withConfigureProfileContext<T>(
  profileName: string,
  run: (profileName: string) => Promise<T> | T,
): Promise<T> {
  ensureProfileExists(profileName);
  return await run(profileName);
}

function configureClearLakehouseCredentials(profileName: string): void {
  secretDelete("lakehouse/password", profileName);
  secretDelete("lakehouse/basic-token", profileName);
  configSet("user", "", profileName);
  configSet("lakehouse_credential_expiry", "", profileName);
}

function configureClearManagementCredentials(profileName: string): void {
  secretDelete("api-key", profileName);
  secretDelete("oauth/access-token", profileName);
  secretDelete("oauth/refresh-token", profileName);
  configSet("api_key_env", "", profileName);
  configSet("oauth_expiry", "", profileName);
}

export function configureClearAll(profileName: string): void {
  configureClearLakehouseCredentials(profileName);
  configureClearManagementCredentials(profileName);
  clearProfileEndpoint("api_base", profileName);
  clearProfileEndpoint("management_api_base", profileName);
}

export async function configureRunSet(
  options: ConfigureOptions,
  sink: OutputSink = getOutputSink(),
  org = "",
): Promise<void> {
  return withConfigureProfileContext(resolveConfigureProfile(options, org), async (profileName) => {
    let user = options.user ?? "";
    let password = options.password ?? "";
    let apiKey = options.apiKey ?? "";
    const basicToken = options.basicToken ?? "";
    const env = options.env ?? "";
    const dataPlaneUrl = options.dataPlaneUrl ?? "";
    const controlPlaneUrl = options.controlPlaneUrl ?? "";
    const allowInsecureHttp = options.allowInsecureHttp ?? false;

    const passwordFromArgv =
      Boolean(options.password) && !options.passwordStdin && !options.interactive;
    const apiKeyFromArgv = Boolean(options.apiKey) && !options.apiKeyStdin && !options.interactive;
    if (passwordFromArgv || apiKeyFromArgv) {
      sink.writeMetadata([renderDisplayText([span(ARGV_SECRET_WARNING, "subtle")])]);
    }

    const hasAnyInput =
      user ||
      password ||
      basicToken ||
      apiKey ||
      env ||
      options.passwordStdin ||
      options.apiKeyStdin ||
      dataPlaneUrl ||
      controlPlaneUrl;

    if (!hasAnyInput) {
      throw new CliError(
        "Nothing to configure. Use --user/--password, --basic-token, or --api-key --env <name>.",
      );
    }

    if (options.passwordStdin) {
      password = (await Bun.stdin.text()).replace(/\n$/, "");
    }
    if (options.apiKeyStdin) {
      apiKey = (await Bun.stdin.text()).replace(/\n$/, "");
    }

    const hasLakehouseCredentials = Boolean(user || password);
    const hasLakehouseBasicToken = Boolean(basicToken);
    const hasApiKey = Boolean(apiKey);
    const lakehouseMechanismCount =
      Number(hasLakehouseCredentials) + Number(hasLakehouseBasicToken);
    const hasAnyCredential = hasLakehouseCredentials || hasLakehouseBasicToken || hasApiKey;

    if (lakehouseMechanismCount > 1) {
      throw new CliError(
        "Choose a single lakehouse authentication mechanism: --user/--password or --basic-token.",
      );
    }
    if (hasApiKey && (hasLakehouseCredentials || hasLakehouseBasicToken)) {
      throw new CliError(
        "Choose a single authentication mechanism per configure invocation: lakehouse credentials or --api-key.",
      );
    }
    if (controlPlaneUrl && !hasAnyCredential) {
      throw new CliError("--control-plane-url must be set together with a credential.");
    }
    if (env && !hasApiKey) {
      throw new CliError("--env applies only to --api-key.");
    }
    if (!hasAnyCredential && !dataPlaneUrl) {
      throw new CliError(
        "Nothing to configure. Use --user/--password, --basic-token, or --api-key --env <name>.",
      );
    }
    if (hasLakehouseCredentials && (!user || !password)) {
      throw new CliError("--user and --password must be provided together.");
    }
    if (hasApiKey && !env) {
      throw new CliError("--api-key requires --env <name>.");
    }

    if (hasApiKey) {
      configureClearManagementCredentials(profileName);
      secretSet("api-key", apiKey, profileName, { fromArgv: apiKeyFromArgv });
      configSet("api_key_env", env, profileName);
      if (org) {
        configSet("organization_slug", org, profileName);
      }
    }
    if (hasLakehouseBasicToken) {
      configureClearLakehouseCredentials(profileName);
      secretSet("lakehouse/basic-token", basicToken, profileName);
    } else if (hasLakehouseCredentials) {
      configureClearLakehouseCredentials(profileName);
      configSet("user", user, profileName);
      secretSet("lakehouse/password", password, profileName, { fromArgv: passwordFromArgv });
    }

    if (dataPlaneUrl) {
      assertAllowedApiBase(dataPlaneUrl, { allowInsecureHttp });
      configSet("api_base", dataPlaneUrl, profileName);
    } else if (hasAnyCredential) {
      clearProfileEndpoint("api_base", profileName);
    }
    if (controlPlaneUrl) {
      assertAllowedApiBase(controlPlaneUrl, { allowInsecureHttp });
      configSet("management_api_base", controlPlaneUrl, profileName);
    } else if (hasAnyCredential) {
      clearProfileEndpoint("management_api_base", profileName);
    }

    if (hasApiKey) {
      sink.writeMetadata([
        renderDisplayText([span(`Saved management API key for environment ${env}.`, "subtle")]),
      ]);
    } else if (hasLakehouseBasicToken) {
      sink.writeMetadata([renderDisplayText([span("Saved lakehouse Basic token.", "subtle")])]);
    } else if (hasLakehouseCredentials) {
      sink.writeMetadata([
        renderDisplayText([span(`Saved lakehouse credentials for user ${user}.`, "subtle")]),
      ]);
    } else if (dataPlaneUrl) {
      sink.writeMetadata([
        renderDisplayText([span(`Saved data plane URL ${dataPlaneUrl}.`, "subtle")]),
      ]);
    }
    markCurrentProfileUpdated(profileName);
  });
}

export function configureRunClear(sink: OutputSink = getOutputSink()): void {
  const profiles = existsSync(profilesDir()) ? listProfiles() : [];
  for (const profile of profiles) {
    configureClearLakehouseCredentials(profile.name);
    configureClearManagementCredentials(profile.name);
  }
  for (const filePath of [configFile(), credentialsFile()]) {
    try {
      unlinkSync(filePath);
    } catch {
      // already removed
    }
  }
  try {
    rmSync(profilesDir(), { recursive: true, force: true });
  } catch {
    // already removed
  }
  getCliRuntime().session = undefined;
  sink.writeMetadata([
    renderDisplayText([span("Cleared all altertable configuration.", "subtle")]),
  ]);
}
