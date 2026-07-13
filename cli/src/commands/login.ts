import { defineLocalCommand } from "@/lib/operation-command-builders.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { getCliContext, isJsonOutput, setCliContext } from "@/context.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { refreshCliRuntimeContext, type OutputSink } from "@/lib/runtime.ts";
import { httpSend } from "@/lib/http.ts";
import { resolveManagementApiBase, resolveOAuthBase } from "@/lib/config.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { runLoginFlow, type TokenResponse } from "@/lib/oauth-flow.ts";
import { storeOAuthTokens } from "@/lib/oauth-profile.ts";
import type { WhoamiResponse } from "@/features/management/model.ts";
import { formatWhoamiPrincipalLine } from "@/features/management/render.ts";
import { configureRunClear } from "@/lib/profile-configure-core.ts";
import {
  assertProfileHasNoEnvCredentials,
  createEmptyProfile,
  deriveProfileName,
  profileExists,
  profileHasAnyAuthConfigured,
  resolveWorkingProfile,
  setActiveProfile,
  updateProfile,
} from "@/features/profile/model.ts";
import { terminalSuccess } from "@/ui/terminal/styles.ts";

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY;
}

export function assertInteractiveLogin(): void {
  if (isJsonOutput(getCliContext()) || !isInteractiveTerminal()) {
    throw new ConfigurationError(
      "altertable login needs an interactive terminal with a browser and does not support --json or --agent.\nFor headless setups use 'altertable profile --configure --api-key atm_xxx --env <name>'.",
    );
  }
}

export function resolveWhoamiEnvironmentSlug(whoami: WhoamiResponse): string | undefined {
  return whoami.environment_slug;
}

type LoginProfileMetadata = {
  environment: string;
  profileName: string;
  profileAction: "created" | "reused" | "replaced" | "unchanged";
};

type LoginProfileAction = LoginProfileMetadata["profileAction"];

function loginProfileName(whoami: WhoamiResponse, environment: string, fallback: string): string {
  const organizationSlug = whoami.organization?.slug;
  return organizationSlug ? deriveProfileName(organizationSlug, environment) : fallback;
}

function selectLoginProfile(
  whoami: WhoamiResponse,
  environment: string,
  replaceCurrentProfile: boolean,
): Pick<LoginProfileMetadata, "profileName" | "profileAction"> {
  const currentProfile = resolveWorkingProfile(getCliContext().profile);
  if (replaceCurrentProfile) {
    return { profileName: currentProfile, profileAction: "replaced" };
  }

  // Sign into the current profile while it has no credentials of its own yet — a
  // fresh `default` or a just-created empty profile. Only branch to a new profile
  // once the current one is already authenticated, so a second login doesn't
  // clobber an existing session. (Env credentials never reach here — login is
  // refused up front while they are set.)
  if (!profileHasAnyAuthConfigured(currentProfile)) {
    return { profileName: currentProfile, profileAction: "unchanged" };
  }

  const targetProfile = loginProfileName(whoami, environment, currentProfile);
  if (targetProfile === currentProfile) {
    return { profileName: targetProfile, profileAction: "unchanged" };
  }

  let profileAction: LoginProfileAction;
  if (profileExists(targetProfile)) {
    profileAction = "reused";
  } else {
    createEmptyProfile(targetProfile);
    profileAction = "created";
  }
  setActiveProfile(targetProfile);
  setCliContext({ ...getCliContext(), profile: targetProfile });
  refreshCliRuntimeContext(getCliContext());
  return { profileName: targetProfile, profileAction };
}

export function storeLoginProfileMetadata(
  whoami: WhoamiResponse,
  args: LoginArgs,
): LoginProfileMetadata {
  const environment = resolveWhoamiEnvironmentSlug(whoami);

  // OAuth login must always return an environment.
  if (!environment) {
    throw new Error("No environment returned from `whoami` post-login. Aborting.");
  }

  const { profileName, profileAction } = selectLoginProfile(
    whoami,
    environment,
    Boolean(args["replace-profile"]),
  );
  if (args["data-plane-url"]) {
    assertAllowedApiBase(args["data-plane-url"], {
      allowInsecureHttp: Boolean(args["allow-insecure-http"]),
    });
  }

  updateProfile(profileName, {
    environment,
    organizationSlug: whoami.organization?.slug,
    organizationName: whoami.organization?.name,
    principalType: whoami.principal?.type,
    principalName: whoami.principal?.name,
    principalEmail: whoami.principal?.email,
    principalSlug: whoami.principal?.slug,
    ...(args["data-plane-url"] ? { dataPlane: args["data-plane-url"] } : {}),
    ...(args["control-plane-url"] ? { controlPlane: args["control-plane-url"] } : {}),
  });

  return { environment, profileName, profileAction };
}

export type LoginArgs = {
  "data-plane-url"?: string;
  "control-plane-url"?: string;
  "allow-insecure-http"?: boolean;
  "replace-profile"?: boolean;
};

/**
 * When `--control-plane-url` is passed, validate it and apply it to this login
 * session only, up until the login is successful.
 */
export function applyControlPlaneOverride(args: LoginArgs): void {
  const url = args["control-plane-url"];
  if (!url) {
    return;
  }
  const envOverride = process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  if (envOverride && envOverride !== url) {
    throw new ConfigurationError(
      `ALTERTABLE_MANAGEMENT_API_BASE=${envOverride} overrides --control-plane-url=${url}. Unset the environment variable or make them match.`,
    );
  }
  if (args["allow-insecure-http"]) {
    // resolveManagementApiRoot re-validates the URL on every read using this env
    // var, so set it too — otherwise an http:// root would fail the very next
    // read (whoami, and later commands in this process).
    process.env.ALTERTABLE_ALLOW_INSECURE_HTTP = "1";
  }
  assertAllowedApiBase(url, { allowInsecureHttp: Boolean(args["allow-insecure-http"]) });
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = url;
}

// Profile-free on purpose: the minted token — not the current profile's stored
// auth, which may still be a different org's session — decides who we are.
export async function fetchLoginWhoami(
  oauthResponse: TokenResponse,
  managementApiBase: string,
): Promise<WhoamiResponse> {
  const body = await httpSend({
    method: "GET",
    url: `${managementApiBase}${encodeManagementEndpoint("/whoami")}`,
    authHeader: `Authorization: Bearer ${oauthResponse.access_token}`,
    authPlane: "management",
  });
  return JSON.parse(body) as WhoamiResponse;
}

async function fetchCurrentProfileWhoami(): Promise<WhoamiResponse> {
  return JSON.parse(await managementRequest("GET", "/whoami")) as WhoamiResponse;
}

export function sameWhoamiContext(a: WhoamiResponse, b: WhoamiResponse): boolean {
  return (
    a.principal?.type === b.principal?.type &&
    a.principal?.slug === b.principal?.slug &&
    a.principal?.email === b.principal?.email &&
    a.organization?.slug === b.organization?.slug &&
    a.environment_slug === b.environment_slug
  );
}

async function runLogin(args: LoginArgs, sink: OutputSink): Promise<void> {
  assertProfileHasNoEnvCredentials("altertable login");
  assertInteractiveLogin();
  applyControlPlaneOverride(args);

  const currentProfile = resolveWorkingProfile(getCliContext().profile);
  const oauthBase = resolveOAuthBase(currentProfile);
  const managementApiBase = resolveManagementApiBase(currentProfile);

  // Past this point the flow is profile-free so it can't accidentally read another org's stored session.
  const oauthResponse = await runLoginFlow(sink, oauthBase);
  const whoami = await fetchLoginWhoami(oauthResponse, managementApiBase);

  // Login succeeded and we can now persist whoami metadata and any control-plane override to the profile so later commands target it.
  const { environment, profileName, profileAction } = storeLoginProfileMetadata(whoami, args);
  storeOAuthTokens(oauthResponse, profileName);
  refreshCliRuntimeContext(getCliContext());

  // Refresh whoami from the profile and check if the identity is the same as the one we just authenticated as.
  const refreshedWhoami = await fetchCurrentProfileWhoami();
  if (!sameWhoamiContext(whoami, refreshedWhoami)) {
    throw new Error(
      "Login failed: the identity before and after profile persistence do not match.",
    );
  }

  const identity = formatWhoamiPrincipalLine(whoami);
  const profileMessages = {
    created: `created profile "${profileName}"`,
    reused: `using existing profile "${profileName}"`,
    replaced: `replaced current profile with "${profileName}"`,
    unchanged: `using profile "${profileName}"`,
  } satisfies Record<LoginProfileAction, string>;
  sink.writeMetadata([
    `${terminalSuccess("✓")} Logged in (${identity}) — ${profileMessages[profileAction]}; environment "${environment}".`,
  ]);
}

export const loginCommand = defineLocalCommand({
  id: "login",
  mutates: true,
  localConfig: true,
  output: "none",
  meta: {
    name: "login",
    commandGroup: "platform",
    description: "Sign in with your browser (OAuth) and store the session.",
    examples: ["altertable login", "altertable login --replace-profile"],
  },
  args: {
    "control-plane-url": {
      type: "string",
      description:
        "Control-plane server root to log in against; saved to the profile only on success (the CLI appends /oauth and /rest/v1). Default: https://app.altertable.ai",
    },
    "data-plane-url": {
      type: "string",
      description:
        "Data-plane base URL saved to the profile only on successful login. Default: https://api.altertable.ai",
    },
    "allow-insecure-http": {
      type: "boolean",
      description:
        "Allow http:// URLs other than localhost for --control-plane-url (for development only)",
    },
    "replace-profile": {
      type: "boolean",
      description: "Store the login session in the current profile instead of switching profiles",
    },
  },
  local: (_input, context) => runLogin(context.args as LoginArgs, context.sink),
});

export const logoutCommand = defineLocalCommand({
  id: "logout",
  mutates: true,
  localConfig: true,
  output: "none",
  meta: {
    name: "logout",
    commandGroup: "platform",
    description: "Remove stored credentials and settings for all profiles.",
    examples: ["altertable logout"],
  },
  local: (_input, { sink }) => {
    configureRunClear(sink);
  },
});
