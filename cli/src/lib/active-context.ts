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
import { ConfigurationError } from "@/lib/errors.ts";
import type { WhoamiResponse } from "@/lib/management-formatters.ts";
import { ensureProfileExists } from "@/lib/profile.ts";
import {
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

export type ActiveContextSummaryView = {
  document: DisplayDocument;
};

export type ActiveContextDetailsView = {
  document: DisplayDocument;
};

function formatConfiguredValue(detail: string | null | undefined): string {
  if (detail === null || detail === undefined || detail.length === 0) {
    return terminalNotConfiguredStatus();
  }
  return detail;
}

type ContextSummaryRow = {
  profile: string;
  environment: string;
  management: string;
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
    profile: context.profile,
    environment: plainStatus(context.environment),
    management: plainStatus(context.management),
    lakehouse: plainStatus(context.lakehouse),
  };
}

function resolveEnvironment(showData: ConfigureShowData): string | undefined {
  const envOverride = process.env.ALTERTABLE_ENV;
  if (envOverride && envOverride.length > 0) {
    return envOverride;
  }
  return showData.credentials.management.environment;
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
    profile: context.profile,
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

export function buildActiveContextSummaryView(context: ActiveContext): ActiveContextSummaryView {
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
      ? [text([terminalHighlightCommands("Hint: run `altertable configure`")])]
      : []),
  ];

  return {
    document: document(section(...summaryBlocks)),
  };
}

export function formatActiveContextSummary(context: ActiveContext): string {
  const lines = renderDisplayDocument(buildActiveContextSummaryView(context).document);
  return `\n\n${formatTerminalSection(indentSummaryLines(lines))}`;
}

export function buildActiveContextDetailsView(context: ActiveContext): ActiveContextDetailsView {
  const hints = formatConfigureSetupHints(context.credentialStatus);
  const overrides = formatConfigureEnvOverrideLines(DETAIL_INDENT, DETAIL_LABEL_WIDTH);
  const detailBlocks = [
    rows(contextDetailRows(context)),
    ...(hints.length > 0 || overrides.length > 0 ? [text(["", ...hints, ...overrides])] : []),
  ];

  return {
    document: document(section(...detailBlocks)),
  };
}

export function formatActiveContextDetails(context: ActiveContext): string {
  const lines = renderDisplayDocument(buildActiveContextDetailsView(context).document, {
    indent: DETAIL_INDENT,
    labelWidth: DETAIL_LABEL_WIDTH,
  });
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
