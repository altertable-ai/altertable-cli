import type { ConfigureShowData } from "@/lib/configure-credential-status.ts";
import {
  type ConfigureVerifyResult,
  formatConfigureVerifyRemediation,
} from "@/lib/configure-verify.ts";
import type { ConfigureSelectOption } from "@/lib/configure-prompts.ts";
import {
  document,
  renderDisplayDocument,
  rows,
  section,
  table,
  text,
  type DisplayDocument,
  type DisplayRow,
} from "@/lib/display-view.ts";
import { formatTerminalUrls, terminalAccent } from "@/lib/terminal-style.ts";
import type { ProfileInspect, ProfileSummary } from "@/lib/profile.ts";

export type ProfileStatusResult = {
  profile: ProfileInspect;
  configuration: ConfigureShowData;
  verification?: ConfigureVerifyResult;
};

export type ProfileInspectView = {
  document: DisplayDocument;
};

export type ProfileStatusView = {
  document: DisplayDocument;
};

export type ProfileListView = {
  document: DisplayDocument;
};

export type ShellExportView = {
  env: Record<string, string>;
  lines: readonly string[];
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

export function buildProfileInspectView(profile: ProfileInspect): ProfileInspectView {
  return {
    document: document(section(rows(profileInspectRows(profile)))),
  };
}

export function formatProfileInspect(profile: ProfileInspect): string {
  return renderDisplayDocument(buildProfileInspectView(profile).document).join("\n");
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

function formatCredentialDetail(
  credential: ConfigureShowData["credentials"]["management"],
): string {
  if (!credential.configured) {
    return "not configured";
  }
  const parts = [
    credential.mechanism ?? "configured",
    credential.source ? `source: ${credential.source}` : "",
    credential.environment ? `env: ${credential.environment}` : "",
    credential.expires ? `expires: ${credential.expires}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function formatLakehouseCredentialDetail(
  credential: ConfigureShowData["credentials"]["lakehouse"],
): string {
  if (!credential.configured) {
    return "not configured";
  }
  const parts = [
    credential.mechanism ?? "configured",
    credential.source ? `source: ${credential.source}` : "",
    credential.user ? `user: ${credential.user}` : "",
    credential.expires ? `expires: ${credential.expires}` : "",
  ].filter(Boolean);
  return parts.join(", ");
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

export function buildProfileStatusView(result: ProfileStatusResult): ProfileStatusView {
  const statusRows: DisplayRow[] = [
    { label: "Verification", value: formatVerificationStatus(result.verification) },
    {
      label: "Management",
      value: formatCredentialDetail(result.configuration.credentials.management),
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

  return {
    document: document(
      section(rows(profileInspectRows(result.profile))),
      section(rows(statusRows), ...(errors.length > 0 ? [text(errors)] : [])),
    ),
  };
}

export function formatProfileStatus(result: ProfileStatusResult): string {
  return renderDisplayDocument(buildProfileStatusView(result).document).join("\n");
}

export function buildProfileListView(profiles: readonly ProfileSummary[]): ProfileListView {
  return {
    document: document(
      section(
        table({
          rows: profiles,
          columns: [
            {
              header: "  NAME",
              cell: (profile) => `${profile.active ? "✓" : " "} ${profile.name}`,
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
    ),
  };
}

export function formatProfileList(profiles: readonly ProfileSummary[]): string {
  return renderDisplayDocument(buildProfileListView(profiles).document).join("\n");
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

function formatShellExport(name: string, value: string): string {
  return `export ${name}=${JSON.stringify(value)}`;
}

export function buildProfileShellExportView(profileName: string): ShellExportView {
  const env = { ALTERTABLE_PROFILE: profileName };
  return {
    env,
    lines: Object.entries(env).map(([name, value]) => formatShellExport(name, value)),
  };
}

export function buildProfileDirenvView(profileName: string): ShellExportView {
  const exportView = buildProfileShellExportView(profileName);
  return {
    env: exportView.env,
    lines: ["# Generated by: altertable profile direnv", ...exportView.lines],
  };
}

export function renderShellExportView(view: ShellExportView): string {
  return view.lines.join("\n");
}
