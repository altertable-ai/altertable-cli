import { defineLocalCommand } from "@/lib/operation-command-builders.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { getCliContext, isJsonOutput } from "@/context.ts";
import { configSet } from "@/lib/config.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { refreshCliRuntimeContext, type OutputSink } from "@/lib/runtime.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { runLoginFlow } from "@/lib/oauth-flow.ts";
import { storeOAuthTokens } from "@/lib/oauth-profile.ts";
import { formatWhoamiPrincipalLine, type WhoamiResponse } from "@/lib/management-formatters.ts";
import { configureRunClear } from "@/lib/configure.ts";
import { terminalSuccess } from "@/lib/terminal-style.ts";

export function assertInteractiveLogin(): void {
  if (isJsonOutput(getCliContext())) {
    throw new ConfigurationError(
      "altertable login does not support --json or --agent; it needs an interactive browser sign-in.",
    );
  }
  if (!process.stdin.isTTY) {
    throw new ConfigurationError(
      "altertable login needs an interactive terminal. For headless setups use 'altertable configure --api-key atm_xxx --env <name>'.",
    );
  }
}

export function resolveWhoamiEnvironmentSlug(whoami: WhoamiResponse): string | undefined {
  return whoami.environment_slug;
}

export type LoginArgs = {
  "control-plane-url"?: string;
  "allow-insecure-http"?: boolean;
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
  const environment = resolveWhoamiEnvironmentSlug(whoami);

  // OAuth login must always return an environment.
  if (!environment) {
    throw new Error("No environment returned from `whoami` post-login. Aborting.");
  }
  configSet("api_key_env", environment);

  // Login succeeded — now persist the control-plane override to the profile so
  // later commands target it (kept session-only until here so a failed login
  // against a bad URL never writes it).
  if (args["control-plane-url"]) {
    configSet("management_api_base", args["control-plane-url"]);
  }

  const identity = formatWhoamiPrincipalLine(whoami);
  sink.writeMetadata([
    `${terminalSuccess("✓")} Logged in (${identity}) — environment "${environment}".`,
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
    examples: ["altertable login"],
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
