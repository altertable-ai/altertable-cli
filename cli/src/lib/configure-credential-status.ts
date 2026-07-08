import { configDir, configGet, resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import { getCliContext } from "@/context.ts";
import type { ConfigureAuthPlane } from "@/lib/configure-verify.ts";
import {
  document,
  renderDisplayDocument,
  renderDisplayRows,
  rows,
  section,
  text,
  type DisplayDocument,
  type DisplayRow,
} from "@/lib/display-view.ts";
import { getActiveProfileName } from "@/lib/profile.ts";
import { secretStoreDisplay } from "@/lib/secrets.ts";
import { terminalDescription, terminalHighlightCommands } from "@/lib/terminal-style.ts";
import { secretExists } from "@/lib/secrets.ts";

const DETAIL_INDENT = "  ";
const DETAIL_LABEL_WIDTH = 17;
const NESTED_INDENT = `${DETAIL_INDENT}  `;
const NESTED_LABEL_WIDTH = 14;

export type ConfigureCredentialStatus = {
  hasManagement: boolean;
  hasLakehouse: boolean;
};

export type ConfigurePlaneCredential = {
  configured: boolean;
  mechanism?:
    | "management_api_key"
    | "management_oauth"
    | "lakehouse_basic_token"
    | "lakehouse_username_password";
  source?: "stored" | "environment";
  environment?: string;
  user?: string;
  api_key?: "set";
  oauth?: "set";
  expires?: string;
  password?: "set";
  basic_token?: "set";
};

export type ConfigureShowOverrides = {
  environment?: string;
  stored_environment?: string | null;
  api_key?: boolean;
};

export type ConfigureShowData = {
  profile: string;
  config_dir: string;
  secret_store: string;
  data_plane: string;
  control_plane: string;
  credentials: {
    management: ConfigurePlaneCredential;
    lakehouse: ConfigurePlaneCredential;
  };
  overrides: ConfigureShowOverrides;
};

export type ConfigureShowView = {
  document: DisplayDocument;
};

function hasEnvManagementCredentials(): boolean {
  return Boolean(process.env.ALTERTABLE_API_KEY);
}

function hasStoredManagementCredentials(): boolean {
  return secretExists("api-key");
}

function hasOAuthLogin(): boolean {
  return secretExists("oauth/access-token");
}

function timestampMsDisplay(raw: string | undefined): string {
  if (!raw) {
    return "";
  }
  const ms = Number.parseInt(raw, 10);
  return Number.isNaN(ms) ? "" : new Date(ms).toLocaleString();
}

function hasEnvLakehouseCredentials(): boolean {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return true;
  }
  return Boolean(
    process.env.ALTERTABLE_LAKEHOUSE_USERNAME && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD,
  );
}

function hasStoredLakehouseCredentials(): boolean {
  return secretExists("lakehouse/basic-token") || secretExists("lakehouse/password");
}

export function configureCredentialStatus(): ConfigureCredentialStatus {
  return {
    hasManagement:
      hasStoredManagementCredentials() || hasEnvManagementCredentials() || hasOAuthLogin(),
    hasLakehouse: hasStoredLakehouseCredentials() || hasEnvLakehouseCredentials(),
  };
}

function buildManagementCredential(): ConfigurePlaneCredential {
  // Precedence mirrors getManagementAuthHeader: env key → OAuth login → stored key.
  if (hasEnvManagementCredentials()) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "environment",
      environment: process.env.ALTERTABLE_ENV ?? configGet("api_key_env") ?? undefined,
    };
  }
  if (hasOAuthLogin()) {
    return {
      configured: true,
      mechanism: "management_oauth",
      source: "stored",
      environment: configGet("api_key_env") || undefined,
      oauth: "set",
      expires: configGet("oauth_expiry") || undefined,
    };
  }
  if (hasStoredManagementCredentials()) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "stored",
      environment: configGet("api_key_env") || undefined,
      api_key: "set",
    };
  }
  return { configured: false };
}

function buildLakehouseCredential(): ConfigurePlaneCredential {
  if (hasStoredLakehouseCredentials()) {
    if (secretExists("lakehouse/basic-token")) {
      return {
        configured: true,
        mechanism: "lakehouse_basic_token",
        source: "stored",
        basic_token: "set",
        expires: configGet("lakehouse_credential_expiry") || undefined,
      };
    }
    return {
      configured: true,
      mechanism: "lakehouse_username_password",
      source: "stored",
      user: configGet("user") || undefined,
      password: "set",
    };
  }
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return {
      configured: true,
      mechanism: "lakehouse_basic_token",
      source: "environment",
    };
  }
  const envUser = process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  if (envUser && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD) {
    return {
      configured: true,
      mechanism: "lakehouse_username_password",
      source: "environment",
      user: envUser,
    };
  }
  return { configured: false };
}

function buildConfigureShowOverrides(): ConfigureShowOverrides {
  const overrides: ConfigureShowOverrides = {};
  const storedApiKeyEnv = configGet("api_key_env");
  const envOverride = process.env.ALTERTABLE_ENV;

  if (envOverride && envOverride !== storedApiKeyEnv) {
    overrides.environment = envOverride;
    overrides.stored_environment = storedApiKeyEnv || null;
  }
  if (process.env.ALTERTABLE_API_KEY && hasStoredManagementCredentials()) {
    overrides.api_key = true;
  }
  return overrides;
}

export function buildConfigureShowData(profileOverride?: string): ConfigureShowData {
  const activeProfile = getActiveProfileName();
  const displayProfile = profileOverride ?? getCliContext().profile ?? activeProfile;

  return {
    profile: displayProfile,
    config_dir: configDir(),
    secret_store: secretStoreDisplay(),
    data_plane: resolveApiBase(),
    control_plane: resolveManagementApiBase(),
    credentials: {
      management: buildManagementCredential(),
      lakehouse: buildLakehouseCredential(),
    },
    overrides: buildConfigureShowOverrides(),
  };
}

export function managementPlaneStatusDetail(): string | null {
  if (hasEnvManagementCredentials()) {
    return "via ALTERTABLE_API_KEY";
  }
  if (hasOAuthLogin()) {
    const env = configGet("api_key_env");
    return env ? `OAuth login (${env})` : "OAuth login";
  }
  if (!hasStoredManagementCredentials()) {
    return null;
  }
  return configGet("api_key_env") || "unknown";
}

export function lakehousePlaneStatusDetail(): string | null {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    return "via ALTERTABLE_BASIC_AUTH_TOKEN";
  }
  const envUser = process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  if (envUser && process.env.ALTERTABLE_LAKEHOUSE_PASSWORD) {
    return envUser;
  }
  if (!hasStoredLakehouseCredentials()) {
    return null;
  }
  if (secretExists("lakehouse/basic-token")) {
    return "basic token";
  }
  return configGet("user") || "unknown";
}

type FormatConfigureAuthenticationOptions = {
  planes?: ConfigureAuthPlane[];
  indent?: string;
  labelWidth?: number;
};

function organizationDisplay(): string {
  const organizationSlug = configGet("organization_slug");
  const organizationName = configGet("organization_name");
  return organizationName && organizationSlug
    ? `${organizationName} (${organizationSlug})`
    : organizationName || organizationSlug;
}

function managementCredentialRows(credential: ConfigurePlaneCredential): DisplayRow[] {
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
    const organization = organizationDisplay();
    if (organization) {
      rows.push({ label: "Organization:", value: organization, level: 1 });
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

function lakehouseCredentialRows(credential: ConfigurePlaneCredential): DisplayRow[] {
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

function configureOverrideRows(overrides: ConfigureShowOverrides): DisplayRow[] {
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

function configureAuthenticationRows(
  data: ConfigureShowData,
  planes: readonly ConfigureAuthPlane[] | undefined,
): DisplayRow[] {
  const includePlane = (plane: ConfigureAuthPlane): boolean =>
    planes === undefined || planes.includes(plane);
  return [
    ...(includePlane("management") ? managementCredentialRows(data.credentials.management) : []),
    ...(includePlane("lakehouse") ? lakehouseCredentialRows(data.credentials.lakehouse) : []),
  ];
}

export function buildConfigureShowView(
  data: ConfigureShowData,
  options: { planes?: ConfigureAuthPlane[] } = {},
): ConfigureShowView {
  const authentication = configureAuthenticationRows(data, options.planes);
  const hints = formatConfigureSetupHints({
    hasManagement: data.credentials.management.configured,
    hasLakehouse: data.credentials.lakehouse.configured,
  });
  const overrides = configureOverrideRows(data.overrides);

  return {
    document: document(
      section(rows(configureSummaryRows(data))),
      section(
        rows(authentication),
        ...(hints.length > 0 ? [text(hints)] : []),
        ...(overrides.length > 0 ? [rows(overrides)] : []),
      ),
    ),
  };
}

function renderRows(rows: readonly DisplayRow[], options: FormatConfigureAuthenticationOptions) {
  return renderDisplayRows(rows, {
    indent: options.indent ?? DETAIL_INDENT,
    labelWidth: options.labelWidth ?? DETAIL_LABEL_WIDTH,
    nestedIndent: NESTED_INDENT,
    nestedLabelWidth: NESTED_LABEL_WIDTH,
  });
}

export function renderConfigureShowView(
  view: ConfigureShowView,
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  return renderDisplayDocument(view.document, {
    indent: options.indent ?? DETAIL_INDENT,
    labelWidth: options.labelWidth ?? DETAIL_LABEL_WIDTH,
    nestedIndent: NESTED_INDENT,
    nestedLabelWidth: NESTED_LABEL_WIDTH,
  });
}

export function formatConfigureAuthenticationLines(
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  const data = buildConfigureShowData();
  return renderRows(configureAuthenticationRows(data, options.planes), options);
}

export function formatConfigureSetupHints(status: ConfigureCredentialStatus): string[] {
  const indent = DETAIL_INDENT;

  if (!status.hasManagement && !status.hasLakehouse) {
    return [
      terminalDescription(`${indent}No credentials configured. Run: altertable configure`),
      terminalHighlightCommands(
        `${indent}Hint: run 'altertable configure management' (or 'altertable configure --api-key atm_xxx --env <name>') for management commands, then 'altertable configure lakehouse' (or 'altertable configure --user <u> --password <p>') for lakehouse queries.`,
      ),
    ];
  }

  if (status.hasManagement && !status.hasLakehouse) {
    return [
      terminalHighlightCommands(
        `${indent}Hint: run 'altertable configure lakehouse' or 'altertable configure --user <u> --password <p>' for lakehouse query, upload, upsert, and append commands.`,
      ),
    ];
  }

  if (status.hasLakehouse && !status.hasManagement) {
    return [
      terminalHighlightCommands(
        `${indent}Hint: run 'altertable configure management' or 'altertable configure --api-key atm_xxx --env <name>' for context, catalogs, and other management commands.`,
      ),
    ];
  }

  return [];
}

export function formatConfigureEnvOverrideLines(
  indent: string = DETAIL_INDENT,
  labelWidth: number = DETAIL_LABEL_WIDTH,
): string[] {
  return renderDisplayRows(configureOverrideRows(buildConfigureShowOverrides()), {
    indent,
    labelWidth,
    nestedIndent: NESTED_INDENT,
    nestedLabelWidth: NESTED_LABEL_WIDTH,
  });
}

export function formatConfigureSessionSummary(configuredPlanes: ConfigureAuthPlane[]): string[] {
  return formatConfigureAuthenticationLines({ planes: configuredPlanes });
}
