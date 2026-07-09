import { unlinkSync, rmSync, existsSync } from "node:fs";
import { configFile, configGet, configSet, configUnset, credentialsFile } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import { deriveProfileName, listProfiles } from "@/features/profile/model.ts";
import { ensureProfileExists, profilesDir } from "@/lib/profile-store.ts";
import { getCliContext, setCliContext } from "@/context.ts";
import { secretDelete, secretSet } from "@/lib/secrets.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { getCliRuntime, getOutputSink, type OutputSink } from "@/lib/runtime.ts";
import { terminalMetadata } from "@/ui/terminal/styles.ts";

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
  org?: string;
  show?: boolean;
  clear?: boolean;
  allowInsecureHttp?: boolean;
  /** Secrets collected via the interactive wizard (not CLI flags). */
  interactive?: boolean;
};

const AUTO_PROFILE_NAME = "auto";

function markCurrentProfileUpdated(): void {
  const timestamp = new Date().toISOString();
  if (!configGet("created_at")) {
    configSet("created_at", timestamp);
  }
  configSet("updated_at", timestamp);
}

function resolveConfigureProfile(options: ConfigureOptions): string | undefined {
  const explicitProfile = options.profile;
  const org = options.org ?? "";
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
  return undefined;
}

export async function withConfigureProfileContext<T>(
  profileName: string | undefined,
  run: () => Promise<T> | T,
): Promise<T> {
  if (!profileName) {
    return await run();
  }
  ensureProfileExists(profileName);
  const previous = getCliContext();
  setCliContext({ ...previous, profile: profileName });
  try {
    return await run();
  } finally {
    setCliContext(previous);
  }
}

function configureClearLakehouseCredentials(profileName?: string): void {
  secretDelete("lakehouse/password", profileName);
  secretDelete("lakehouse/basic-token", profileName);
  configUnset("user");
  configUnset("lakehouse_credential_expiry");
}

function configureClearManagementCredentials(profileName?: string): void {
  secretDelete("api-key", profileName);
  secretDelete("oauth/access-token", profileName);
  secretDelete("oauth/refresh-token", profileName);
  configUnset("api_key_env");
  configUnset("oauth_expiry");
}

export function configureClearAll(): void {
  configureClearLakehouseCredentials();
  configureClearManagementCredentials();
  configUnset("api_base");
  configUnset("management_api_base");
}

export async function configureRunSet(
  options: ConfigureOptions,
  sink: OutputSink = getOutputSink(),
): Promise<void> {
  return withConfigureProfileContext(resolveConfigureProfile(options), async () => {
    let user = options.user ?? "";
    let password = options.password ?? "";
    let apiKey = options.apiKey ?? "";
    const basicToken = options.basicToken ?? "";
    const env = options.env ?? "";
    const dataPlaneUrl = options.dataPlaneUrl ?? "";
    const controlPlaneUrl = options.controlPlaneUrl ?? "";
    const org = options.org ?? "";
    const allowInsecureHttp = options.allowInsecureHttp ?? false;

    const passwordFromArgv =
      Boolean(options.password) && !options.passwordStdin && !options.interactive;
    const apiKeyFromArgv = Boolean(options.apiKey) && !options.apiKeyStdin && !options.interactive;
    if (passwordFromArgv || apiKeyFromArgv) {
      sink.writeMetadata([terminalMetadata(ARGV_SECRET_WARNING)]);
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

    const hasLakehouse = Boolean(user || password);
    const hasToken = Boolean(basicToken);
    const hasApiKey = Boolean(apiKey);
    const lakehouseMechanismCount = Number(hasLakehouse) + Number(hasToken);
    const hasAnyCredential = hasLakehouse || hasToken || hasApiKey;

    if (lakehouseMechanismCount > 1) {
      throw new CliError(
        "Choose a single lakehouse authentication mechanism: --user/--password or --basic-token.",
      );
    }
    if (hasApiKey && (hasLakehouse || hasToken)) {
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
    if (hasLakehouse && (!user || !password)) {
      throw new CliError("--user and --password must be provided together.");
    }
    if (hasApiKey && !env) {
      throw new CliError("--api-key requires --env <name>.");
    }

    if (hasApiKey) {
      configureClearManagementCredentials();
      secretSet("api-key", apiKey, undefined, { fromArgv: apiKeyFromArgv });
      configSet("api_key_env", env);
      if (org) {
        configSet("organization_slug", org);
      }
    }
    if (hasToken) {
      configureClearLakehouseCredentials();
      secretSet("lakehouse/basic-token", basicToken);
    } else if (hasLakehouse) {
      configureClearLakehouseCredentials();
      configSet("user", user);
      secretSet("lakehouse/password", password, undefined, { fromArgv: passwordFromArgv });
    }

    if (dataPlaneUrl) {
      assertAllowedApiBase(dataPlaneUrl, { allowInsecureHttp });
      configSet("api_base", dataPlaneUrl);
    } else if (hasAnyCredential) {
      configUnset("api_base");
    }
    if (controlPlaneUrl) {
      assertAllowedApiBase(controlPlaneUrl, { allowInsecureHttp });
      configSet("management_api_base", controlPlaneUrl);
    } else if (hasAnyCredential) {
      configUnset("management_api_base");
    }

    if (hasApiKey) {
      sink.writeMetadata([terminalMetadata(`Saved management API key for environment ${env}.`)]);
    } else if (hasToken) {
      sink.writeMetadata([terminalMetadata("Saved lakehouse Basic token.")]);
    } else if (hasLakehouse) {
      sink.writeMetadata([terminalMetadata(`Saved lakehouse credentials for user ${user}.`)]);
    } else if (dataPlaneUrl) {
      sink.writeMetadata([terminalMetadata(`Saved data plane URL ${dataPlaneUrl}.`)]);
    }
    markCurrentProfileUpdated();
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
  sink.writeMetadata([terminalMetadata("Cleared all altertable configuration.")]);
}
