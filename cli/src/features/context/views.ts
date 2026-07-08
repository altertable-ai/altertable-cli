import type { ActiveContext } from "@/features/context/model.ts";
import {
  formatConfigureEnvOverrideLines,
  formatConfigureSetupHints,
} from "@/features/configure/render.ts";
import {
  document,
  rows,
  section,
  table,
  text,
  type DisplayDocument,
  type DisplayRow,
} from "@/ui/document.ts";
import { terminalHighlightCommands, terminalNotConfiguredStatus } from "@/ui/terminal/styles.ts";

const DETAIL_INDENT = "  ";
const DETAIL_LABEL_WIDTH = 17;

export type ActiveContextSummaryView = {
  document: DisplayDocument;
};

export type ActiveContextDetailsView = {
  document: DisplayDocument;
};

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
