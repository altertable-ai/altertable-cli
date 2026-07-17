import { defineCommand } from "@/lib/command.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { getCliContext, isJsonOutput, setCliContext } from "@/context.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { refreshCliRuntimeContext, type OutputSink } from "@/lib/runtime.ts";
import { httpSend } from "@/lib/http.ts";
import { resolveManagementApiRoot } from "@/lib/config.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { runLoginFlow, type TokenResponse } from "@/lib/oauth-flow.ts";
import { storeOAuthTokens } from "@/lib/oauth-profile.ts";
import type { WhoamiResponse } from "@/lib/management/model.ts";
import { formatWhoamiPrincipalLine } from "@/lib/management/render.ts";
import {
  assertNoEnvConfigMode,
  createEmptyProfile,
  deriveProfileName,
  profileHasAnyAuthConfigured,
  updateProfile,
} from "@/lib/profile/model.ts";
import { profileExists, resolveWorkingProfile, setActiveProfile } from "@/lib/profile-store.ts";
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export const loginCommand = defineCommand({
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
  run: ({ args, sink }) => runLogin(args as LoginArgs, sink),
});

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY;
}

function assertInteractiveLogin(): void {
  if (isJsonOutput(getCliContext()) || !isInteractiveTerminal()) {
    throw new ConfigurationError(
      "altertable login needs an interactive terminal with a browser and does not support --json or --agent.\nFor headless setups use 'altertable profile configure --api-key atm_xxx --env <name>'.",
    );
  }
}

type LoginProfileMetadata = {
  environment: string;
  profileName: string;
  profileAction: "created" | "reused" | "replaced" | "unchanged";
};

type LoginProfileAction = LoginProfileMetadata["profileAction"];

const LOGIN_PROFILE_MESSAGES = {
  created: "created profile",
  reused: "using existing profile",
  replaced: "replaced current profile with",
  unchanged: "using profile",
} satisfies Record<LoginProfileAction, string>;

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

function storeLoginProfileMetadata(
  whoami: WhoamiResponse,
  args: LoginArgs,
  controlPlane: string,
): LoginProfileMetadata {
  const environment = whoami.environment_slug;

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
    controlPlane,
  });

  return { environment, profileName, profileAction };
}

type LoginArgs = {
  "data-plane-url"?: string;
  "control-plane-url"?: string;
  "allow-insecure-http"?: boolean;
  "replace-profile"?: boolean;
};

function resolveLoginEndpoints(
  args: LoginArgs,
  profileName: string,
): { controlPlane: string; oauthBase: string; managementApiBase: string } {
  const override = args["control-plane-url"];
  const controlPlane = override
    ? override.replace(/\/$/, "")
    : resolveManagementApiRoot(profileName);
  assertAllowedApiBase(controlPlane, {
    allowInsecureHttp: Boolean(args["allow-insecure-http"]),
  });
  return {
    controlPlane,
    oauthBase: `${controlPlane}/oauth`,
    managementApiBase: `${controlPlane}/rest/v1`,
  };
}

// Profile-free on purpose: the minted token — not the current profile's stored
// auth, which may still be a different org's session — decides who we are.
async function fetchLoginWhoami(
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

async function runLogin(args: LoginArgs, sink: OutputSink): Promise<void> {
  assertNoEnvConfigMode();
  assertInteractiveLogin();

  const currentProfile = resolveWorkingProfile(getCliContext().profile);
  const { controlPlane, oauthBase, managementApiBase } = resolveLoginEndpoints(
    args,
    currentProfile,
  );

  // Past this point the flow is profile-free so it can't accidentally read another org's stored session.
  const oauthResponse = await runLoginFlow(sink, oauthBase);
  const whoami = await fetchLoginWhoami(oauthResponse, managementApiBase);

  // Login succeeded and we can now persist whoami metadata and any control-plane override to the profile so later commands target it.
  const { environment, profileName, profileAction } = storeLoginProfileMetadata(
    whoami,
    args,
    controlPlane,
  );
  storeOAuthTokens(oauthResponse, profileName);
  refreshCliRuntimeContext(getCliContext());

  const identity = formatWhoamiPrincipalLine(whoami);
  const profileMessage = `${LOGIN_PROFILE_MESSAGES[profileAction]} "${profileName}"`;
  sink.writeMetadata([
    renderDisplayText([
      span("✓", "success"),
      span(` Logged in (${identity}) — ${profileMessage}; environment "${environment}".`),
    ]),
  ]);
}
