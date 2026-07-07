import type { ConfigureShowData } from "@/lib/configure-credential-status.ts";
import {
  type ConfigureVerifyResult,
  formatConfigureVerifyRemediation,
} from "@/lib/configure-verify.ts";
import type { ConfigureSelectOption } from "@/lib/configure-prompts.ts";
import { formatInfoList } from "@/lib/info-list.ts";
import { formatTerminalUrls, terminalAccent } from "@/lib/terminal-style.ts";
import type { ProfileInspect, ProfileSummary } from "@/lib/profile.ts";

export type ProfileStatusResult = {
  profile: ProfileInspect;
  configuration: ConfigureShowData;
  verification?: ConfigureVerifyResult;
};

export function formatProfileInspect(profile: ProfileInspect): string {
  return formatInfoList(
    [
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
      { label: "Data plane", value: formatTerminalUrls(profile.endpoints.data_plane ?? "default") },
      {
        label: "Control plane",
        value: formatTerminalUrls(profile.endpoints.control_plane ?? "default"),
      },
      { label: "Config file", value: terminalAccent(profile.config_file) },
    ],
    { indent: "  " },
  );
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

export function formatProfileStatus(result: ProfileStatusResult): string {
  const lines = [
    formatProfileInspect(result.profile),
    "",
    formatInfoList(
      [
        { label: "Verification", value: formatVerificationStatus(result.verification) },
        {
          label: "Management",
          value: formatCredentialDetail(result.configuration.credentials.management),
        },
        {
          label: "Lakehouse",
          value: formatLakehouseCredentialDetail(result.configuration.credentials.lakehouse),
        },
        { label: "Control plane", value: formatTerminalUrls(result.configuration.control_plane) },
        { label: "Data plane", value: formatTerminalUrls(result.configuration.data_plane) },
      ],
      { indent: "  " },
    ),
  ];

  if (result.verification?.errors.length) {
    lines.push(
      "",
      ...result.verification.errors.map(
        (error) =>
          `  ${error.plane}: ${error.message}\n  ${formatConfigureVerifyRemediation(error.plane)}`,
      ),
    );
  }

  return lines.join("\n");
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

export function profileShellExports(profileName: string): Record<"ALTERTABLE_PROFILE", string> {
  return { ALTERTABLE_PROFILE: profileName };
}

function formatShellExport(name: string, value: string): string {
  return `export ${name}=${JSON.stringify(value)}`;
}

export function formatProfileEnv(profileName: string): string {
  return formatShellExport("ALTERTABLE_PROFILE", profileName);
}

export function formatProfileDirenv(profileName: string): string {
  return ["# Generated by: altertable profile direnv", formatProfileEnv(profileName)].join("\n");
}
