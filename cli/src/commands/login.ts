import { defineLocalCommand } from "@/lib/operation-command-builders.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { getCliContext, isJsonOutput, setCliContext } from "@/context.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { refreshCliRuntimeContext, type OutputSink } from "@/lib/runtime.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { runLoginFlow } from "@/lib/oauth-flow.ts";
import { storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { formatWhoamiPrincipalLine, type WhoamiResponse } from "@/lib/management-formatters.ts";
import { configureRunClear } from "@/lib/configure.ts";
import {
  createProfile,
  deriveProfileName,
  moveProfileConfigKey,
  profileExists,
  renameProfile,
  resolveProfileName,
  setActiveProfile,
  updateProfile,
} from "@/lib/profile.ts";
import { moveProfileSecrets } from "@/lib/secrets.ts";
import { terminalSuccess } from "@/lib/terminal-style.ts";

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY;
}

export function assertInteractiveLogin(): void {
  if (isJsonOutput(getCliContext()) || !isInteractiveTerminal()) {
    throw new ConfigurationError(
      "altertable login needs an interactive terminal with a browser and does not support --json or --agent.\nFor headless setups use 'altertable configure --api-key atm_xxx --env <name>'.",
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

const OAUTH_SECRET_ACCOUNTS = ["oauth/access-token", "oauth/refresh-token"] as const;

function moveOAuthSession(sourceProfile: string, targetProfile: string): void {
  moveProfileSecrets(sourceProfile, targetProfile, OAUTH_SECRET_ACCOUNTS);
  moveProfileConfigKey(sourceProfile, targetProfile, "oauth_expiry");
}

function promoteLoginProfile(
  whoami: WhoamiResponse,
  environment: string,
  replaceProfile: boolean,
): Pick<LoginProfileMetadata, "profileName" | "profileAction"> {
  const sourceProfile = resolveProfileName(getCliContext().profile);
  const organizationSlug = whoami.organization?.slug;
  const targetProfile = organizationSlug
    ? deriveProfileName(organizationSlug, environment)
    : sourceProfile;
  if (targetProfile === sourceProfile) {
    return { profileName: targetProfile, profileAction: "unchanged" };
  }

  let profileAction: LoginProfileMetadata["profileAction"];
  if (profileExists(targetProfile)) {
    moveOAuthSession(sourceProfile, targetProfile);
    profileAction = "reused";
  } else if (replaceProfile) {
    renameProfile(sourceProfile, targetProfile);
    profileAction = "replaced";
  } else {
    createProfile(targetProfile);
    moveOAuthSession(sourceProfile, targetProfile);
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

  const { profileName, profileAction } = promoteLoginProfile(
    whoami,
    environment,
    Boolean(args["replace-profile"]),
  );

  updateProfile(profileName, {
    environment,
    organizationSlug: whoami.organization?.slug,
    organizationName: whoami.organization?.name,
    principalType: whoami.principal?.type,
    principalName: whoami.principal?.name,
    principalEmail: whoami.principal?.email,
    principalSlug: whoami.principal?.slug,
    ...(args["control-plane-url"] ? { controlPlane: args["control-plane-url"] } : {}),
  });

  return { environment, profileName, profileAction };
}

export type LoginArgs = {
  "control-plane-url"?: string;
  "allow-insecure-http"?: boolean;
  "replace-profile"?: boolean;
};

/**
 * When `--control-plane-url` is passed, validate it and apply it to this login
 * session only, up until the login is successul.
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

async function runLogin(args: LoginArgs, sink: OutputSink): Promise<void> {
  assertInteractiveLogin();
  applyControlPlaneOverride(args);

  const oauthResponse = await runLoginFlow(sink);
  storeOAuthTokens(oauthResponse);
  // Rebuild the session so the just-stored token is used
  refreshCliRuntimeContext(getCliContext());

  const whoami = JSON.parse(await managementRequest("GET", "/whoami")) as WhoamiResponse;
  // Login succeeded — now persist whoami metadata and any control-plane override
  // to the profile so later commands target it. The override is kept session-only
  // until here so a failed login against a bad URL never writes it.
  const { environment, profileName, profileAction } = storeLoginProfileMetadata(whoami, args);

  const identity = formatWhoamiPrincipalLine(whoami);
  const profileMessage =
    profileAction === "created"
      ? `created profile "${profileName}"`
      : profileAction === "reused"
        ? `using existing profile "${profileName}"`
        : profileAction === "replaced"
          ? `replaced current profile with "${profileName}"`
          : `using profile "${profileName}"`;
  sink.writeMetadata([
    `${terminalSuccess("✓")} Logged in (${identity}) — ${profileMessage}; environment "${environment}".`,
  ]);
}

export const loginCommand = defineLocalCommand({
  id: "login",
  mutates: true,
  localConfig: true,
  output: "none",
  meta: {
    name: "login",
    description: "Sign in with your browser (OAuth) and store the session.",
    examples: ["altertable login", "altertable login --replace-profile"],
  },
  args: {
    "control-plane-url": {
      type: "string",
      description:
        "Control-plane server root to log in against; saved to the profile only on success (the CLI appends /oauth and /rest/v1). Default: https://app.altertable.ai",
    },
    "allow-insecure-http": {
      type: "boolean",
      description:
        "Allow http:// URLs other than localhost for --control-plane-url (for development only)",
    },
    "replace-profile": {
      type: "boolean",
      description:
        "Rename the current profile to the derived login profile instead of creating one",
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
    description: "Remove stored credentials for all profiles (alias for 'configure --clear').",
    examples: ["altertable logout"],
  },
  local: (_input, { sink }) => {
    configureRunClear(sink);
  },
});
