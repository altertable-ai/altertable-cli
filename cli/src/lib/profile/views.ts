import {
  type ConfigureAuthPlane,
  type ConfigureVerifyResult,
  formatConfigureVerifyRemediation,
} from "@/lib/profile-status.ts";
import type { SelectOption } from "@/ui/prompts.ts";
import {
  document,
  rows,
  section,
  span,
  table,
  text,
  type DisplayDocument,
  type DisplayRow,
  type DisplayText,
} from "@/ui/document.ts";
import { TERMINAL_INDENT } from "@/ui/terminal/spacing.ts";
import type {
  ConfigureLakehouseCredential,
  ConfigureManagementCredential,
  ConfigureShowData,
  ProfileInspect,
  ProfileSummary,
} from "@/lib/profile/model.ts";
import { isFromEnvProfile } from "@/lib/profile-store.ts";
import type { ShellExportView } from "@/ui/shell/model.ts";

const ACTIVE_PROFILE_MARK = "✓";
const INACTIVE_PROFILE_MARK = " ";
const PROFILE_NAME_HEADER = `${INACTIVE_PROFILE_MARK} NAME`;

function linkedUrl(value: string): DisplayText {
  return /^https?:\/\//.test(value) ? [span(value, "accent", value)] : value;
}

function profileInspectRows(profile: ProfileInspect): DisplayRow[] {
  // The env pseudo-profile has no stored name/status; a heading line replaces
  // them (see buildProfileInspectView).
  const identityRows: DisplayRow[] = isFromEnvProfile(profile.name)
    ? []
    : [
        { label: "Profile", value: `${profile.name}${profile.active ? " (active)" : ""}` },
        { label: "Status", value: profile.status },
      ];
  return [
    ...identityRows,
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
      value: linkedUrl(profile.endpoints.data_plane ?? "default"),
    },
    {
      label: "Control plane",
      value: linkedUrl(profile.endpoints.control_plane ?? "default"),
    },
    { label: "Config file", value: [span(profile.config_file, "accent")] },
  ];
}

export function buildProfileInspectView(profile: ProfileInspect): DisplayDocument {
  if (isFromEnvProfile(profile.name)) {
    return document(
      section(
        text([`${TERMINAL_INDENT}Configuration set from environment variables`]),
        rows(profileInspectRows(profile)),
      ),
    );
  }
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
            cell: (profile) => [
              span(
                `${profile.active ? ACTIVE_PROFILE_MARK : INACTIVE_PROFILE_MARK} ${profile.name}`,
                "strong",
              ),
            ],
          },
          {
            header: "ORG",
            cell: (profile) => [span(profile.organization ?? "", "muted")],
          },
          {
            header: "PRINCIPAL",
            cell: (profile) => [span(profile.principal ?? "", "muted")],
          },
          {
            header: "ENV",
            cell: (profile) => [span(profile.management_env ?? "", "muted")],
          },
          {
            header: "MGMT",
            cell: (profile) => [span(profile.management_auth ?? "", "string")],
          },
          {
            header: "LAKEHOUSE",
            cell: (profile) => [span(profile.lakehouse_auth ?? "", "string")],
          },
          {
            header: "OAUTH EXPIRES",
            cell: (profile) => [span(profile.oauth_expires_at ?? "", "muted")],
          },
          {
            header: "STATUS",
            cell: (profile) => [span(profile.status ?? "", "accent")],
          },
          {
            header: "DATA PLANE",
            cell: (profile) => linkedUrl(profile.data_plane ?? ""),
          },
        ],
        emptyMessage: "No profiles configured.",
      }),
    ),
  );
}

export function profileSwitchOption(profile: ProfileSummary): SelectOption {
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
