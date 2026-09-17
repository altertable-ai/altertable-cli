import { defineCommand } from "@/lib/command.ts";
import { assertRetrieved, ConfigurationError } from "@/lib/errors.ts";
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
  deriveServiceAccountProfileName,
  profileHasAnyAuthConfigured,
  updateProfile,
} from "@/lib/profile/model.ts";
import { profileExists, resolveWorkingProfile, setActiveProfile } from "@/lib/profile-store.ts";
import { secretSet } from "@/lib/secrets.ts";
import {
  fetchEnvironmentCatalogs,
  parseServiceAccountScope,
  provisionEnvironmentServiceAccount,
  type EnvironmentCatalog,
  type EnvironmentServiceAccountResponse,
  type ServiceAccountAccessMode,
  type ServiceAccountRoleAssignment,
  type ServiceAccountScope,
} from "@/lib/service-account-provision.ts";
import { document, section, span, table } from "@/ui/document.ts";
import { renderDocumentText } from "@/ui/renderers/terminal.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export const loginCommand = defineCommand({
  metadata: {
    name: "login",
    commandGroup: "platform",
    description: "Sign in with your browser (OAuth) and store the session.",
    examples: [
      "altertable login",
      "altertable login --replace-profile",
      'altertable login --service-account "CI Bot" --scope analytics:ro',
      'altertable login --service-account "CI Bot" --scope ro',
    ],
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
    "service-account": {
      type: "string",
      valueHint: "LABEL",
      description:
        "Create an environment-scoped service account with this label and store its access token instead of your login session",
    },
    scope: {
      type: "string",
      valueHint: "MODE|CATALOG:MODE,...",
      description:
        "Request a service account limited to `ro` or `rw` on every catalog, or to specific catalogs, e.g. `analytics:ro,staging:rw` (requires --service-account). The catalog access the server actually grants is reported on success.",
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
      "altertable login needs an interactive terminal with a browser and does not support --json or --agent.\n" +
        "For headless setups, pipe a management key:\n" +
        `  printf '%s' "$KEY" | altertable profile configure --api-key-stdin --env <name>\n` +
        "Or set ALTERTABLE_API_KEY and ALTERTABLE_ENV.",
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

function requireWhoamiEnvironment(whoami: WhoamiResponse): string {
  return assertRetrieved(whoami.environment_slug, "login", "whoami.environment_slug");
}

function storeLoginProfileMetadata(
  whoami: WhoamiResponse,
  args: LoginArgs,
  controlPlane: string,
): LoginProfileMetadata {
  const environment = requireWhoamiEnvironment(whoami);
  const { profileName, profileAction } = selectLoginProfile(
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
    principalEmail: whoami.principal?.email ?? undefined,
    principalSlug: whoami.principal?.slug ?? undefined,
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
  "service-account"?: string;
  scope?: string;
};

type ServiceAccountLoginRequest = {
  label: string;
  scope?: ServiceAccountScope;
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

function applyLoginDataPlaneUrl(args: LoginArgs): void {
  if (args["data-plane-url"]) {
    assertAllowedApiBase(args["data-plane-url"], {
      allowInsecureHttp: Boolean(args["allow-insecure-http"]),
    });
  }
}

function parseServiceAccountLoginArgs(args: LoginArgs): ServiceAccountLoginRequest | undefined {
  const label = args["service-account"];
  if (args.scope !== undefined && label === undefined) {
    throw new ConfigurationError("--scope requires --service-account.");
  }
  if (label === undefined) {
    return undefined;
  }
  if (args["replace-profile"]) {
    throw new ConfigurationError(
      "--service-account cannot be combined with --replace-profile; a service account always gets its own profile.",
    );
  }
  if (label.trim().length === 0) {
    throw new ConfigurationError("--service-account requires a non-empty label.");
  }
  return {
    label: label.trim(),
    ...(args.scope === undefined ? {} : { scope: parseServiceAccountScope(args.scope) }),
  };
}

function activateDerivedProfile(profileName: string): void {
  if (!profileExists(profileName)) {
    createEmptyProfile(profileName);
  }
  setActiveProfile(profileName);
  setCliContext({ ...getCliContext(), profile: profileName });
  refreshCliRuntimeContext(getCliContext());
}

function catalogAccessMode(
  assignment: ServiceAccountRoleAssignment,
): ServiceAccountAccessMode | null {
  if (assignment.role === "catalog:writer") return "rw";
  if (assignment.role === "catalog:reader") return "ro";
  return null;
}

type CatalogAccessRow = { name: string; slug: string; access: ServiceAccountAccessMode };

/**
 * Lists the catalogs the service account can reach, by name. Role assignments
 * carry ids only, and assignments whose catalog is not in the lookup (or whose
 * role is not a catalog role) are dropped rather than printed as raw ids.
 */
function summarizeCatalogAccess(
  created: EnvironmentServiceAccountResponse,
  catalogs: Map<string, EnvironmentCatalog>,
): CatalogAccessRow[] {
  const rows = new Map<string, CatalogAccessRow>();
  for (const assignment of created.role_assignments ?? []) {
    const access = catalogAccessMode(assignment);
    const catalog = catalogs.get(assignment.resource_id);
    if (!access || !catalog) continue;
    const existing = rows.get(assignment.resource_id);
    if (!existing || access === "rw") {
      rows.set(assignment.resource_id, { ...catalog, access });
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function formatCatalogAccessTable(rows: CatalogAccessRow[]): string {
  return renderDocumentText(
    document(
      section(
        table({
          rows,
          columns: [
            { header: "CATALOG", cell: (row) => [span(row.name, "strong")], flex: true },
            { header: "SLUG", cell: (row) => [span(row.slug, "accent")] },
            { header: "ACCESS", cell: (row) => [span(row.access, "subtle")] },
          ],
          emptyMessage: "",
        }),
      ),
    ),
  );
}

async function completeServiceAccountLogin(
  oauthResponse: TokenResponse,
  whoami: WhoamiResponse,
  args: LoginArgs,
  controlPlane: string,
  managementApiBase: string,
  request: ServiceAccountLoginRequest,
  sink: OutputSink,
): Promise<void> {
  const environment = requireWhoamiEnvironment(whoami);
  const organizationSlug = assertRetrieved(
    whoami.organization?.slug,
    "login",
    "whoami.organization.slug",
  );

  const created = await provisionEnvironmentServiceAccount({
    managementApiBase,
    accessToken: oauthResponse.access_token,
    environment,
    label: request.label,
    ...(request.scope ? { scope: request.scope } : {}),
  });

  const profileName = deriveServiceAccountProfileName(
    organizationSlug,
    environment,
    created.service_account.slug,
  );
  activateDerivedProfile(profileName);
  updateProfile(profileName, {
    environment,
    organizationSlug,
    organizationName: whoami.organization?.name,
    principalType: "ServiceAccount",
    principalName: created.service_account.label,
    principalSlug: created.service_account.slug,
    ...(args["data-plane-url"] ? { dataPlane: args["data-plane-url"] } : {}),
    controlPlane,
  });

  secretSet("oauth/access-token", created.service_oauth_token, profileName);

  const catalogs = await fetchEnvironmentCatalogs({
    managementApiBase,
    accessToken: oauthResponse.access_token,
    environment,
  });
  const catalogAccess = summarizeCatalogAccess(created, catalogs);
  const lines = [
    renderDisplayText([
      span("✓", "success"),
      span(
        ` Created service account "${created.service_account.label}" — profile "${profileName}" is now active; environment "${environment}".`,
      ),
    ]),
  ];
  if (catalogAccess.length > 0) {
    lines.push("", renderDisplayText([span("Catalog access", "subtle")]));
    lines.push(formatCatalogAccessTable(catalogAccess));
  }
  if (request.scope && (created.role_assignments ?? []).length === 0) {
    lines.push(
      renderDisplayText([
        span(
          "! The server reported no role assignments, so the requested restriction could not be confirmed. Check the service account's access before using this token.",
          "warning",
        ),
      ]),
    );
  }
  for (const line of lines) {
    sink.writeHuman(line);
  }
}

async function runLogin(args: LoginArgs, sink: OutputSink): Promise<void> {
  const serviceAccountRequest = parseServiceAccountLoginArgs(args);
  applyLoginDataPlaneUrl(args);
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

  if (serviceAccountRequest) {
    await completeServiceAccountLogin(
      oauthResponse,
      whoami,
      args,
      controlPlane,
      managementApiBase,
      serviceAccountRequest,
      sink,
    );
    return;
  }

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
  sink.writeHuman(
    renderDisplayText([
      span("✓", "success"),
      span(` Logged in (${identity}) — ${profileMessage}; environment "${environment}".`),
    ]),
  );
}
