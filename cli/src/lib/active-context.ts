import { getCliContext, setCliContext } from "@/context.ts";
import {
  buildConfigureShowData,
  configureCredentialStatus,
  formatConfigureEnvOverrideLines,
  formatConfigureSetupHints,
  lakehousePlaneStatusDetail,
  managementPlaneStatusDetail,
  type ConfigureShowData,
} from "@/lib/configure-credential-status.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { formatWhoamiIdentityLines, type WhoamiResponse } from "@/lib/management-formatters.ts";
import { ensureProfileExists } from "@/lib/profile.ts";
import { renderFixedTableSection } from "@/lib/table-format.ts";
import {
  formatTerminalLabelValue,
  formatTerminalSection,
  terminalHighlightCommands,
  terminalNotConfiguredStatus,
} from "@/lib/terminal-style.ts";

const DETAIL_INDENT = "  ";
const DETAIL_LABEL_WIDTH = 17;

function withProfileContextSync<T>(profileName: string | undefined, run: () => T): T {
  if (!profileName) {
    return run();
  }
  ensureProfileExists(profileName);
  const previous = getCliContext();
  setCliContext({ ...previous, profile: profileName });
  try {
    return run();
  } finally {
    setCliContext(previous);
  }
}

export type ActiveContext = {
  profile: string;
  environment?: string;
  data_plane: string;
  control_plane: string;
  management: string | null;
  lakehouse: string | null;
  credentialStatus: ReturnType<typeof configureCredentialStatus>;
  credentials: ConfigureShowData["credentials"];
  overrides: ConfigureShowData["overrides"];
  principal?: WhoamiResponse["principal"];
  organization?: WhoamiResponse["organization"];
};

const DETAIL_LABEL_OPTIONS = { indent: DETAIL_INDENT, labelWidth: DETAIL_LABEL_WIDTH };

function formatConfiguredValue(detail: string | null | undefined): string {
  if (detail === null || detail === undefined || detail.length === 0) {
    return terminalNotConfiguredStatus();
  }
  return detail;
}

type ContextSummaryRow = {
  org: string;
  environment: string;
  lakehouse: string;
};

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
    org: contextOrganizationLabel(context),
    environment: plainStatus(context.environment),
    lakehouse: plainStatus(context.lakehouse),
  };
}

function contextOrganizationLabel(context: ActiveContext): string {
  const organization = context.organization;
  if (!organization) {
    return context.profile;
  }
  if (organization.name && organization.slug) {
    return `${organization.name} (${organization.slug})`;
  }
  return organization.name || organization.slug || context.profile;
}

function formatContextSummaryTable(context: ActiveContext): string {
  const row = contextSummaryRow(context);
  return renderFixedTableSection(
    [row],
    [
      {
        header: "ORG",
        cell: (entry) => formatStatusCell(entry.org),
        style: "strong",
      },
      {
        header: "ENV",
        cell: (entry) => formatStatusCell(entry.environment),
        style: "accent",
      },
      {
        header: "LAKEHOUSE",
        cell: (entry) => formatStatusCell(entry.lakehouse),
        style: "string",
        flex: true,
      },
    ],
  );
}

function formatContextSummaryLines(context: ActiveContext): string[] {
  const lines = [formatContextSummaryTable(context)];

  if (!context.credentialStatus.hasManagement && !context.credentialStatus.hasLakehouse) {
    lines.push(terminalHighlightCommands("Hint: run `altertable configure`"));
  }

  return lines;
}

function resolveEnvironment(showData: ConfigureShowData): string | undefined {
  const contextEnv = getCliContext().environment;
  if (contextEnv && contextEnv.length > 0) {
    return contextEnv;
  }
  const envOverride = process.env.ALTERTABLE_ENV;
  if (envOverride && envOverride.length > 0) {
    return envOverride;
  }
  return showData.credentials.management.environment;
}

function formatContextDetailLines(context: ActiveContext): string[] {
  const lines = [
    formatTerminalLabelValue(
      "Organization:",
      contextOrganizationLabel(context),
      DETAIL_LABEL_OPTIONS,
    ),
    formatTerminalLabelValue(
      "Environment:",
      formatConfiguredValue(context.environment),
      DETAIL_LABEL_OPTIONS,
    ),
  ];

  if (context.principal !== undefined || context.organization !== undefined) {
    lines.push(
      ...formatWhoamiIdentityLines(
        {
          principal: context.principal ?? {},
          organization: context.organization ?? {},
        },
        { ...DETAIL_LABEL_OPTIONS, includeOrganization: false },
      ),
    );
  }

  lines.push(
    formatTerminalLabelValue("Data plane:", context.data_plane, {
      ...DETAIL_LABEL_OPTIONS,
      linkifyUrls: true,
    }),
    formatTerminalLabelValue("Control plane:", context.control_plane, {
      ...DETAIL_LABEL_OPTIONS,
      linkifyUrls: true,
    }),
    formatTerminalLabelValue(
      "Lakehouse:",
      formatConfiguredValue(context.lakehouse),
      DETAIL_LABEL_OPTIONS,
    ),
  );

  return lines;
}

export function buildActiveContext(profileOverride?: string): ActiveContext {
  const profile = profileOverride ?? getCliContext().profile;

  return withProfileContextSync(profile, () => {
    const showData = buildConfigureShowData(profileOverride);
    const credentialStatus = configureCredentialStatus();

    return {
      profile: showData.profile,
      environment: resolveEnvironment(showData),
      data_plane: showData.data_plane,
      control_plane: showData.control_plane,
      management: managementPlaneStatusDetail(),
      lakehouse: lakehousePlaneStatusDetail(),
      credentialStatus,
      credentials: showData.credentials,
      overrides: showData.overrides,
    };
  });
}

export function withAuthenticatedIdentity(
  context: ActiveContext,
  whoami: WhoamiResponse,
): ActiveContext {
  return {
    ...context,
    principal: whoami.principal,
    organization: whoami.organization,
  };
}

export function activeContextToJson(context: ActiveContext): Record<string, unknown> {
  return {
    org: contextOrganizationLabel(context),
    environment: context.environment ?? null,
    data_plane: context.data_plane,
    control_plane: context.control_plane,
    management: context.management,
    lakehouse: context.lakehouse,
    credentials: context.credentials,
    overrides: context.overrides,
    ...(context.principal !== undefined ? { principal: context.principal } : {}),
    ...(context.organization !== undefined ? { organization: context.organization } : {}),
  };
}

function indentSummaryLines(lines: string[]): string[] {
  return lines.flatMap((line) => line.split("\n").map((segment) => `${DETAIL_INDENT}${segment}`));
}

export function formatActiveContextSummary(context: ActiveContext): string {
  return `\n\n${formatTerminalSection(indentSummaryLines(formatContextSummaryLines(context)))}`;
}

export function formatActiveContextDetails(context: ActiveContext): string {
  const lines = [...formatContextDetailLines(context)];
  const hints = formatConfigureSetupHints(context.credentialStatus);
  const overrides = formatConfigureEnvOverrideLines(DETAIL_INDENT, DETAIL_LABEL_WIDTH);

  if (hints.length > 0 || overrides.length > 0) {
    lines.push("");
    lines.push(...hints, ...overrides);
  }

  return formatTerminalSection(lines);
}

export function tryFormatActiveContextSummary(profileOverride?: string): string {
  try {
    return formatActiveContextSummary(buildActiveContext(profileOverride));
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return "";
    }
    throw error;
  }
}
