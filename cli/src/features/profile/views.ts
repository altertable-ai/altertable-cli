import type { ConfigureShowData } from "@/features/configure/model.ts";
import {
  type ConfigureVerifyResult,
  formatConfigureVerifyRemediation,
} from "@/lib/configure-verify.ts";
import type { ConfigureSelectOption } from "@/lib/configure-prompts.ts";
import {
  document,
  rows,
  section,
  table,
  text,
  type DisplayDocument,
  type DisplayRow,
} from "@/ui/document.ts";
import { formatTerminalUrls, terminalAccent } from "@/ui/terminal/styles.ts";
import type { ProfileInspect, ProfileSummary } from "@/features/profile/model.ts";
import type { ShellExportView } from "@/ui/shell/model.ts";

const ACTIVE_PROFILE_MARK = "✓";
const INACTIVE_PROFILE_MARK = " ";
const PROFILE_NAME_HEADER = `${INACTIVE_PROFILE_MARK} NAME`;

export type ProfileStatusResult = {
  profile: ProfileInspect;
  configuration: ConfigureShowData;
  verification?: ConfigureVerifyResult;
};

function profileInspectRows(profile: ProfileInspect): DisplayRow[] {
  return [
    { label: "Profile", value: `${profile.name}${profile.active ? " (active)" : ""}` },
    { label: "Status", value: profile.status },
    { label: "Principal", value: formatProfilePrincipal(profile) },
    { label: "Organization", value: profile.organization.slug ?? "not set" },
    { label: "Environment", value: profile.environment ?? "not set" },
    { label: "Description", value: profile.description ?? "not set" },
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

function credentialDetail(parts: readonly string[]): string {
  return parts.filter(Boolean).join(", ");
}

function formatManagementCredentialDetail(
  credential: ConfigureShowData["credentials"]["management"],
): string {
  if (!credential.configured) {
    return "not configured";
  }
  if (credential.mechanism === "management_oauth") {
    return credentialDetail([
      "management_oauth",
      credential.source ? `source: ${credential.source}` : "",
      credential.environment ? `env: ${credential.environment}` : "",
      credential.expires ? `expires: ${credential.expires}` : "",
    ]);
  }
  return credentialDetail([
    credential.mechanism,
    credential.source ? `source: ${credential.source}` : "",
    credential.environment ? `env: ${credential.environment}` : "",
  ]);
}

function formatLakehouseCredentialDetail(
  credential: ConfigureShowData["credentials"]["lakehouse"],
): string {
  if (!credential.configured) {
    return "not configured";
  }
  if (credential.mechanism === "lakehouse_basic_token") {
    return credentialDetail([
      "lakehouse_basic_token",
      credential.source ? `source: ${credential.source}` : "",
      credential.expires ? `expires: ${credential.expires}` : "",
    ]);
  }
  return credentialDetail([
    credential.mechanism,
    credential.source ? `source: ${credential.source}` : "",
    credential.user ? `user: ${credential.user}` : "",
  ]);
}

function formatVerificationStatus(result: ConfigureVerifyResult | undefined): string {
  if (!result) {
    return "not run";
  }
  if (result.configured.length === 0) {
    return "nothing configured";
  }
  if (result.errors.length === 0) {
    return "verified";
  }
  const failed = result.errors.map((error) => error.plane).join(", ");
  return `failed (${failed})`;
}

export function buildProfileStatusView(result: ProfileStatusResult): DisplayDocument {
  const statusRows: DisplayRow[] = [
    { label: "Verification", value: formatVerificationStatus(result.verification) },
    {
      label: "Management",
      value: formatManagementCredentialDetail(result.configuration.credentials.management),
    },
    {
      label: "Lakehouse",
      value: formatLakehouseCredentialDetail(result.configuration.credentials.lakehouse),
    },
    { label: "Control plane", value: result.configuration.control_plane, linkifyUrls: true },
    { label: "Data plane", value: result.configuration.data_plane, linkifyUrls: true },
  ];
  const errors =
    result.verification?.errors.map(
      (error) =>
        `  ${error.plane}: ${error.message}\n  ${formatConfigureVerifyRemediation(error.plane)}`,
    ) ?? [];

  return document(
    section(rows(profileInspectRows(result.profile))),
    section(rows(statusRows), ...(errors.length > 0 ? [text(errors)] : [])),
  );
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
