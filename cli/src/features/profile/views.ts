import {
  type ConfigureAuthPlane,
  type ConfigureVerifyResult,
  formatConfigureVerifyRemediation,
} from "@/lib/profile-status.ts";
import type { ConfigureSelectOption } from "@/lib/profile-configure-interactive.ts";
import {
  document,
  rows,
  section,
  table,
  text,
  type DisplayDocument,
  type DisplayRow,
} from "@/ui/document.ts";
import { TERMINAL_INDENT } from "@/ui/terminal/spacing.ts";
import {
  formatTerminalUrls,
  terminalAccent,
  terminalDescription,
  terminalHighlightCommands,
  terminalNotConfiguredStatus,
} from "@/ui/terminal/styles.ts";
import type {
  ActiveContext,
  ConfigureCredentialStatus,
  ConfigureLakehouseCredential,
  ConfigureManagementCredential,
  ConfigureShowData,
  ConfigureShowOverrides,
  ProfileInspect,
  ProfileSummary,
} from "@/features/profile/model.ts";
import type { ShellExportView } from "@/ui/shell/model.ts";

const ACTIVE_PROFILE_MARK = "✓";
const INACTIVE_PROFILE_MARK = " ";
const PROFILE_NAME_HEADER = `${INACTIVE_PROFILE_MARK} NAME`;

function profileInspectRows(profile: ProfileInspect): DisplayRow[] {
  return [
    { label: "Profile", value: `${profile.name}${profile.active ? " (active)" : ""}` },
    { label: "Status", value: profile.status },
    { label: "Principal", value: formatProfilePrincipal(profile) },
    { label: "Organization", value: profile.organization.slug ?? "not set" },
    { label: "Environment", value: profile.environment ?? "not set" },
    { label: "Management auth", value: profile.auth.management },
    { label: "Lakehouse auth", value: profile.auth.lakehouse },
    { label: "OAuth expires", value: profile.timestamps.oauth_expires_at ?? "not set" },
    {
      label: "Lakehouse expires",
      value: profile.timestamps.lakehouse_expires_at ?? "not set",
    },
    {
      label: "Data plane",
      value: profile.endpoints.data_plane ?? "default",
      linkifyUrls: true,
    },
    {
      label: "Control plane",
      value: profile.endpoints.control_plane ?? "default",
      linkifyUrls: true,
    },
    { label: "Config file", value: terminalAccent(profile.config_file) },
  ];
}

export function buildProfileInspectView(profile: ProfileInspect): DisplayDocument {
  return document(section(rows(profileInspectRows(profile))));
}

function formatProfilePrincipal(profile: ProfileInspect): string {
  if (profile.principal.email) {
    return profile.principal.name
      ? `${profile.principal.name} <${profile.principal.email}>`
      : profile.principal.email;
  }
  if (profile.principal.slug) {
    return profile.principal.name
      ? `${profile.principal.name} (${profile.principal.slug})`
      : profile.principal.slug;
  }
  return profile.principal.name ?? "not set";
}

export function buildProfileListView(profiles: readonly ProfileSummary[]): DisplayDocument {
  return document(
    section(
      table({
        rows: profiles,
        columns: [
          {
            header: PROFILE_NAME_HEADER,
            cell: (profile) =>
              `${profile.active ? ACTIVE_PROFILE_MARK : INACTIVE_PROFILE_MARK} ${profile.name}`,
            style: "strong",
          },
          {
            header: "ORG",
            cell: (profile) => profile.organization ?? "",
            style: "muted",
          },
          {
            header: "PRINCIPAL",
            cell: (profile) => profile.principal ?? "",
            style: "muted",
          },
          {
            header: "ENV",
            cell: (profile) => profile.management_env ?? "",
            style: "muted",
          },
          {
            header: "MGMT",
            cell: (profile) => profile.management_auth ?? "",
            style: "string",
          },
          {
            header: "LAKEHOUSE",
            cell: (profile) => profile.lakehouse_auth ?? "",
            style: "string",
          },
          {
            header: "OAUTH EXPIRES",
            cell: (profile) => profile.oauth_expires_at ?? "",
            style: "muted",
          },
          {
            header: "STATUS",
            cell: (profile) => profile.status ?? "",
            style: "accent",
          },
          {
            header: "DATA PLANE",
            cell: (profile) => formatTerminalUrls(profile.data_plane ?? ""),
            style: "muted",
          },
        ],
        emptyMessage: "No profiles configured.",
      }),
    ),
  );
}

export function profileSwitchOption(profile: ProfileSummary): ConfigureSelectOption {
  const details = [
    profile.active && "active",
    profile.organization && `org: ${profile.organization}`,
    profile.management_env && `env: ${profile.management_env}`,
    profile.principal && `principal: ${profile.principal}`,
    profile.management_auth && `management: ${profile.management_auth}`,
    profile.lakehouse_auth && `lakehouse: ${profile.lakehouse_auth}`,
  ].filter((detail): detail is string => Boolean(detail));
  return {
    value: profile.name,
    label: details.length > 0 ? `${profile.name} (${details.join(", ")})` : profile.name,
  };
}

export function buildProfileShellExportView(profileName: string): ShellExportView {
  return {
    env: { ALTERTABLE_PROFILE: profileName },
  };
}

export function buildProfileDirenvView(profileName: string): ShellExportView {
  return {
    ...buildProfileShellExportView(profileName),
    comments: ["Generated by: altertable profile direnv"],
  };
}

export type ProfileStatusResult = {
  profile: ProfileInspect;
  verification: ConfigureVerifyResult;
};

function verificationPlaneLabel(plane: ConfigureAuthPlane): string {
  return plane === "management" ? "Management:" : "Lakehouse:";
}

function verificationSummary(result: ConfigureVerifyResult): string {
  if (result.configured.length === 0) {
    return "no credentials configured";
  }
  if (result.errors.length === 0) {
    return "verified";
  }
  return `failed (${result.errors.map((error) => error.plane).join(", ")})`;
}

function verificationRows(result: ConfigureVerifyResult): DisplayRow[] {
  const summary: DisplayRow = { label: "Verification:", value: verificationSummary(result) };
  const planes: DisplayRow[] = result.configured.map((plane) => ({
    label: verificationPlaneLabel(plane),
    value: result.verified[plane] ? "verified" : "failed",
    level: 1,
  }));
  return [summary, ...planes];
}

export function buildProfileStatusView(result: ProfileStatusResult): DisplayDocument {
  const errors = result.verification.errors.map(
    (error) =>
      `  ${error.plane}: ${error.message}\n  ${formatConfigureVerifyRemediation(error.plane, result.verification.profile)}`,
  );
  return document(
    ...buildProfileInspectView(result.profile).sections,
    section(
      rows(verificationRows(result.verification)),
      ...(errors.length > 0 ? [text(errors)] : []),
    ),
  );
}

export function profileStatusToJson(result: ProfileStatusResult): Record<string, unknown> {
  return {
    profile: result.profile,
    verification: {
      configured: result.verification.configured,
      verified: result.verification.verified,
      errors: result.verification.errors,
    },
  };
}

export type ConfigureAuthenticationViewOptions = {
  planes?: ConfigureAuthPlane[];
};

function timestampMsDisplay(raw: string | undefined): string {
  if (!raw) {
    return "";
  }
  const ms = Number.parseInt(raw, 10);
  return Number.isNaN(ms) ? "" : new Date(ms).toLocaleString();
}

function organizationDisplay(organization: ConfigureShowData["organization"]): string {
  const organizationSlug = organization.slug;
  const organizationName = organization.name;
  return organizationName && organizationSlug
    ? `${organizationName} (${organizationSlug})`
    : (organizationName ?? organizationSlug ?? "");
}

function managementCredentialRows(
  credential: ConfigureManagementCredential,
  organization: ConfigureShowData["organization"],
): DisplayRow[] {
  if (!credential.configured) {
    return [];
  }
  if (credential.source === "environment") {
    return [
      { label: "Authentication:", value: "management API key (environment)" },
      { label: "source:", value: "ALTERTABLE_API_KEY", level: 1 },
      { label: "environment:", value: credential.environment ?? "unset", level: 1 },
    ];
  }
  if (credential.mechanism === "management_oauth") {
    const rows: DisplayRow[] = [
      { label: "Authentication:", value: "browser login (OAuth)" },
      { label: "Environment:", value: credential.environment ?? "none", level: 1 },
    ];
    const displayOrganization = organizationDisplay(organization);
    if (displayOrganization) {
      rows.push({ label: "Organization:", value: displayOrganization, level: 1 });
    }
    const expires = timestampMsDisplay(credential.expires);
    if (expires) {
      rows.push({ label: "Expires:", value: expires, level: 1 });
    }
    return rows;
  }
  return [
    { label: "Authentication:", value: "management API key" },
    { label: "environment:", value: credential.environment ?? "", level: 1 },
    { label: "api key:", value: credential.api_key ?? "set", level: 1 },
  ];
}

function lakehouseCredentialRows(credential: ConfigureLakehouseCredential): DisplayRow[] {
  if (!credential.configured) {
    return [];
  }
  if (credential.mechanism === "lakehouse_basic_token") {
    const rows: DisplayRow[] = [
      {
        label: "Authentication:",
        value:
          credential.source === "environment"
            ? "lakehouse Basic token (environment)"
            : "lakehouse Basic token",
      },
    ];
    if (credential.source === "environment") {
      rows.push({ label: "source:", value: "ALTERTABLE_BASIC_AUTH_TOKEN", level: 1 });
    } else {
      rows.push({ label: "basic token:", value: credential.basic_token ?? "set", level: 1 });
      const expires = timestampMsDisplay(credential.expires);
      if (expires) {
        rows.push({ label: "expires:", value: expires, level: 1 });
      }
    }
    return rows;
  }
  return [
    {
      label: "Authentication:",
      value:
        credential.source === "environment"
          ? "lakehouse username/password (environment)"
          : "lakehouse username/password",
    },
    { label: "user:", value: credential.user ?? "", level: 1 },
    {
      label: credential.source === "environment" ? "source:" : "password:",
      value:
        credential.source === "environment"
          ? "ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD"
          : (credential.password ?? "set"),
      level: 1,
    },
  ];
}

function configureSummaryRows(data: ConfigureShowData): DisplayRow[] {
  return [
    { label: "Config dir:", value: data.config_dir },
    { label: "Active profile:", value: data.profile },
    { label: "Secret store:", value: data.secret_store },
    { label: "Data plane:", value: data.data_plane, linkifyUrls: true },
    { label: "Control plane:", value: data.control_plane, linkifyUrls: true },
  ];
}

export function configureOverrideRows(overrides: ConfigureShowOverrides): DisplayRow[] {
  const rows: DisplayRow[] = [];
  if (overrides.environment) {
    rows.push({
      label: "Environment override:",
      value: `ALTERTABLE_ENV=${overrides.environment} (stored: ${overrides.stored_environment ?? "none"})`,
    });
  }
  if (overrides.api_key) {
    rows.push({
      label: "API key override:",
      value: "ALTERTABLE_API_KEY is set via environment",
    });
  }
  return rows;
}

export function configureAuthenticationRows(
  data: ConfigureShowData,
  planes: readonly ConfigureAuthPlane[] | undefined,
): DisplayRow[] {
  const includePlane = (plane: ConfigureAuthPlane): boolean =>
    planes === undefined || planes.includes(plane);
  return [
    ...(includePlane("management")
      ? managementCredentialRows(data.credentials.management, data.organization)
      : []),
    ...(includePlane("lakehouse") ? lakehouseCredentialRows(data.credentials.lakehouse) : []),
  ];
}

export function configureSetupHintLines(status: ConfigureCredentialStatus): string[] {
  if (!status.hasManagement && !status.hasLakehouse) {
    return [
      terminalDescription(
        `${TERMINAL_INDENT}No credentials configured. Run: altertable profile --configure`,
      ),
      terminalHighlightCommands(
        `${TERMINAL_INDENT}Hint: run 'altertable profile --configure --scope management' (or 'altertable profile --configure --api-key atm_xxx --env <name>') for management commands, then 'altertable profile --configure --scope lakehouse' (or 'altertable profile --configure --user <u> --password <p>') for lakehouse queries.`,
      ),
    ];
  }

  if (status.hasManagement && !status.hasLakehouse) {
    return [
      terminalHighlightCommands(
        `${TERMINAL_INDENT}Hint: run 'altertable profile --configure --scope lakehouse' or 'altertable profile --configure --user <u> --password <p>' for lakehouse query, upload, upsert, and append commands.`,
      ),
    ];
  }

  if (status.hasLakehouse && !status.hasManagement) {
    return [
      terminalHighlightCommands(
        `${TERMINAL_INDENT}Hint: run 'altertable profile --configure --scope management' or 'altertable profile --configure --api-key atm_xxx --env <name>' for profile show, catalogs, and other management commands.`,
      ),
    ];
  }

  return [];
}

export function buildConfigureShowView(
  data: ConfigureShowData,
  options: ConfigureAuthenticationViewOptions = {},
): DisplayDocument {
  const authentication = configureAuthenticationRows(data, options.planes);
  const hints = configureSetupHintLines({
    hasManagement: data.credentials.management.configured,
    hasLakehouse: data.credentials.lakehouse.configured,
  });
  const overrides = configureOverrideRows(data.overrides);

  return document(
    section(rows(configureSummaryRows(data))),
    section(
      rows(authentication),
      ...(hints.length > 0 ? [text(hints)] : []),
      ...(overrides.length > 0 ? [rows(overrides)] : []),
    ),
  );
}

type ContextSummaryRow = {
  profile: string;
  environment: string;
  management: string;
  lakehouse: string;
};

function formatConfiguredValue(detail: string | null | undefined): string {
  if (detail === null || detail === undefined || detail.length === 0) {
    return terminalNotConfiguredStatus();
  }
  return detail;
}

function plainStatus(detail: string | null | undefined): string {
  if (detail === null || detail === undefined || detail.length === 0) {
    return "not set";
  }
  return detail;
}

function formatStatusCell(value: string): string {
  if (value === "not set") {
    return terminalNotConfiguredStatus();
  }
  return value;
}

function contextSummaryRow(context: ActiveContext): ContextSummaryRow {
  return {
    profile: context.profile,
    environment: plainStatus(context.environment),
    management: plainStatus(context.management),
    lakehouse: plainStatus(context.lakehouse),
  };
}

function identityRows(context: ActiveContext): DisplayRow[] {
  if (context.principal !== undefined || context.organization !== undefined) {
    const principal = context.principal ?? {};
    const organization = context.organization ?? {};
    const identity: DisplayRow[] = [];
    if (principal.type === "ServiceAccount") {
      identity.push({
        label: "Service account:",
        value: `${principal.name ?? ""} (${principal.slug ?? ""})`,
      });
    } else if (principal.email) {
      identity.push({ label: "User:", value: `${principal.name ?? ""} <${principal.email}>` });
    } else if (principal.name) {
      identity.push({ label: "User:", value: principal.name });
    }
    if (organization.name || organization.slug) {
      identity.push({
        label: "Organization:",
        value: `${organization.name ?? ""} (${organization.slug ?? ""})`,
      });
    }
    return identity;
  }
  return [];
}

function contextDetailRows(context: ActiveContext): DisplayRow[] {
  return [
    { label: "Profile:", value: context.profile },
    { label: "Environment:", value: formatConfiguredValue(context.environment) },
    ...identityRows(context),
    { label: "Data plane:", value: context.data_plane, linkifyUrls: true },
    { label: "Control plane:", value: context.control_plane, linkifyUrls: true },
    { label: "Lakehouse:", value: formatConfiguredValue(context.lakehouse) },
  ];
}

export function buildActiveContextSummaryView(context: ActiveContext): DisplayDocument {
  const summaryBlocks = [
    table({
      rows: [contextSummaryRow(context)],
      columns: [
        {
          header: "PROFILE",
          cell: (entry) => formatStatusCell(entry.profile),
          style: "strong",
        },
        {
          header: "ENV",
          cell: (entry) => formatStatusCell(entry.environment),
          style: "accent",
        },
        {
          header: "MGMT",
          cell: (entry) => formatStatusCell(entry.management),
          style: "muted",
        },
        {
          header: "LAKEHOUSE",
          cell: (entry) => formatStatusCell(entry.lakehouse),
          style: "string",
          flex: true,
        },
      ],
    }),
    ...(!context.credentialStatus.hasManagement && !context.credentialStatus.hasLakehouse
      ? [text([terminalHighlightCommands("Hint: run `altertable profile --configure`")])]
      : []),
  ];

  return document(section(...summaryBlocks));
}

export function buildActiveContextDetailsView(context: ActiveContext): DisplayDocument {
  const hints = configureSetupHintLines(context.credentialStatus);
  const overrides = configureOverrideRows(context.overrides);
  const detailBlocks = [
    rows(contextDetailRows(context)),
    ...(hints.length > 0 ? [text(["", ...hints])] : []),
    ...(overrides.length > 0 ? [rows(overrides)] : []),
  ];

  return document(section(...detailBlocks));
}
