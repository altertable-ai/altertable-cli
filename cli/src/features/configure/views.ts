import type { ConfigureAuthPlane } from "@/lib/configure-verify.ts";
import {
  type ConfigureCredentialStatus,
  type ConfigureLakehouseCredential,
  type ConfigureManagementCredential,
  type ConfigureShowData,
  type ConfigureShowOverrides,
} from "@/features/configure/model.ts";
import {
  document,
  rows,
  section,
  text,
  type DisplayDocument,
  type DisplayRow,
} from "@/ui/document.ts";
import { TERMINAL_INDENT } from "@/ui/terminal/spacing.ts";
import { terminalDescription, terminalHighlightCommands } from "@/ui/terminal/styles.ts";

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
      terminalDescription(`${TERMINAL_INDENT}No credentials configured. Run: altertable configure`),
      terminalHighlightCommands(
        `${TERMINAL_INDENT}Hint: run 'altertable configure management' (or 'altertable configure --api-key atm_xxx --env <name>') for management commands, then 'altertable configure lakehouse' (or 'altertable configure --user <u> --password <p>') for lakehouse queries.`,
      ),
    ];
  }

  if (status.hasManagement && !status.hasLakehouse) {
    return [
      terminalHighlightCommands(
        `${TERMINAL_INDENT}Hint: run 'altertable configure lakehouse' or 'altertable configure --user <u> --password <p>' for lakehouse query, upload, upsert, and append commands.`,
      ),
    ];
  }

  if (status.hasLakehouse && !status.hasManagement) {
    return [
      terminalHighlightCommands(
        `${TERMINAL_INDENT}Hint: run 'altertable configure management' or 'altertable configure --api-key atm_xxx --env <name>' for context, catalogs, and other management commands.`,
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
