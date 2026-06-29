import { configDir, configGet, resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import { getCliContext } from "@/context.ts";
import type { ConfigureAuthPlane } from "@/lib/configure-verify.ts";
import { getActiveProfileName } from "@/lib/profile.ts";
import { secretStoreDisplay } from "@/lib/secrets.ts";
import {
  formatTerminalLabelValue,
  terminalDescription,
  terminalHighlightCommands,
} from "@/lib/terminal-style.ts";
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
  mechanism?: "management_api_key" | "lakehouse_basic_token" | "lakehouse_username_password";
  source?: "stored" | "environment";
  environment?: string;
  user?: string;
  api_key?: "set";
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

function hasEnvManagementCredentials(): boolean {
  return Boolean(process.env.ALTERTABLE_API_KEY);
}

function hasStoredManagementCredentials(): boolean {
  return secretExists("api-key");
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
    hasManagement: hasStoredManagementCredentials() || hasEnvManagementCredentials(),
    hasLakehouse: hasStoredLakehouseCredentials() || hasEnvLakehouseCredentials(),
  };
}

function buildManagementCredential(): ConfigurePlaneCredential {
  if (hasStoredManagementCredentials()) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "stored",
      environment: configGet("api_key_env") || undefined,
      api_key: "set",
    };
  }
  if (hasEnvManagementCredentials()) {
    return {
      configured: true,
      mechanism: "management_api_key",
      source: "environment",
      environment: process.env.ALTERTABLE_ENV ?? configGet("api_key_env") ?? undefined,
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

function pushStoredManagementAuthLines(lines: string[], indent: string, labelWidth: number): void {
  lines.push(
    formatTerminalLabelValue("Authentication:", "management API key", { indent, labelWidth }),
    formatTerminalLabelValue("environment:", configGet("api_key_env"), {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
    formatTerminalLabelValue("api key:", "set", {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
  );
}

function pushEnvManagementAuthLines(lines: string[], indent: string, labelWidth: number): void {
  const envSlug = process.env.ALTERTABLE_ENV ?? configGet("api_key_env") ?? "unset";
  lines.push(
    formatTerminalLabelValue("Authentication:", "management API key (environment)", {
      indent,
      labelWidth,
    }),
    formatTerminalLabelValue("source:", "ALTERTABLE_API_KEY", {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
    formatTerminalLabelValue("environment:", envSlug, {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
  );
}

function pushStoredLakehouseAuthLines(lines: string[], indent: string, labelWidth: number): void {
  if (secretExists("lakehouse/basic-token")) {
    lines.push(
      formatTerminalLabelValue("Authentication:", "lakehouse Basic token", { indent, labelWidth }),
      formatTerminalLabelValue("basic token:", "set", {
        indent: NESTED_INDENT,
        labelWidth: NESTED_LABEL_WIDTH,
      }),
    );
    return;
  }

  lines.push(
    formatTerminalLabelValue("Authentication:", "lakehouse username/password", {
      indent,
      labelWidth,
    }),
    formatTerminalLabelValue("user:", configGet("user"), {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
    formatTerminalLabelValue("password:", "set", {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
  );
}

function pushEnvLakehouseAuthLines(lines: string[], indent: string, labelWidth: number): void {
  if (process.env.ALTERTABLE_BASIC_AUTH_TOKEN) {
    lines.push(
      formatTerminalLabelValue("Authentication:", "lakehouse Basic token (environment)", {
        indent,
        labelWidth,
      }),
      formatTerminalLabelValue("source:", "ALTERTABLE_BASIC_AUTH_TOKEN", {
        indent: NESTED_INDENT,
        labelWidth: NESTED_LABEL_WIDTH,
      }),
    );
    return;
  }

  lines.push(
    formatTerminalLabelValue("Authentication:", "lakehouse username/password (environment)", {
      indent,
      labelWidth,
    }),
    formatTerminalLabelValue("user:", process.env.ALTERTABLE_LAKEHOUSE_USERNAME ?? "", {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
    formatTerminalLabelValue("source:", "ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD", {
      indent: NESTED_INDENT,
      labelWidth: NESTED_LABEL_WIDTH,
    }),
  );
}

export function formatConfigureAuthenticationLines(
  options: FormatConfigureAuthenticationOptions = {},
): string[] {
  const indent = options.indent ?? DETAIL_INDENT;
  const labelWidth = options.labelWidth ?? DETAIL_LABEL_WIDTH;
  const includePlane = (plane: ConfigureAuthPlane): boolean =>
    options.planes === undefined || options.planes.includes(plane);

  const lines: string[] = [];

  if (includePlane("management")) {
    if (hasStoredManagementCredentials()) {
      pushStoredManagementAuthLines(lines, indent, labelWidth);
    } else if (hasEnvManagementCredentials()) {
      pushEnvManagementAuthLines(lines, indent, labelWidth);
    }
  }

  if (includePlane("lakehouse")) {
    if (hasStoredLakehouseCredentials()) {
      pushStoredLakehouseAuthLines(lines, indent, labelWidth);
    } else if (hasEnvLakehouseCredentials()) {
      pushEnvLakehouseAuthLines(lines, indent, labelWidth);
    }
  }

  return lines;
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
        `${indent}Hint: run 'altertable configure lakehouse' or 'altertable configure --user <u> --password <p>' for lakehouse query, upload, and append commands.`,
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
  const lines: string[] = [];
  const storedApiKeyEnv = configGet("api_key_env");
  const envOverride = process.env.ALTERTABLE_ENV;

  if (envOverride && envOverride !== storedApiKeyEnv) {
    const storedLabel = storedApiKeyEnv || "none";
    lines.push(
      formatTerminalLabelValue(
        "Environment override:",
        `ALTERTABLE_ENV=${envOverride} (stored: ${storedLabel})`,
        { indent, labelWidth },
      ),
    );
  }

  if (process.env.ALTERTABLE_API_KEY && hasStoredManagementCredentials()) {
    lines.push(
      formatTerminalLabelValue("API key override:", "ALTERTABLE_API_KEY is set via environment", {
        indent,
        labelWidth,
      }),
    );
  }

  return lines;
}

export function formatConfigureSessionSummary(configuredPlanes: ConfigureAuthPlane[]): string[] {
  return formatConfigureAuthenticationLines({ planes: configuredPlanes });
}
