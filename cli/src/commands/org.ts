import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { configSet } from "@/lib/config.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { renderFixedTableSection } from "@/lib/table-format.ts";
import { formatTerminalSection } from "@/lib/terminal-style.ts";
import { deleteProfile, getActiveProfileName, setActiveProfile } from "@/lib/profile.ts";
import { withProfileContextSync } from "@/lib/profile-context.ts";
import {
  formatEnvironmentCloudSummary,
  formatEnvironmentLabel,
  validateEnvironment,
} from "@/commands/env.ts";
import { managementGraphqlRequest } from "@/lib/management-graphql.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";

type OrgEnvironmentSummary = {
  id?: string;
  name?: string;
  slug?: string;
  cloudProvider?: string | null;
  cloudProviderAwsRegion?: string | null;
  cloudProviderHetznerRegion?: string | null;
};

type OrgSummary = {
  id?: string;
  name?: string;
  slug?: string;
  currentPlan?: {
    id?: string;
    name?: string;
  } | null;
  environments?: {
    nodes?: OrgEnvironmentSummary[];
  } | null;
};

type OrganizationListData = {
  currentUser?: {
    organizations?: {
      nodes?: OrgSummary[];
    } | null;
  } | null;
};

type OrganizationData = {
  organization?:
    | (OrgSummary & {
        lakehouseUser?: string | null;
        duckdbVersion?: string | null;
        altertableVersion?: string | null;
        createdAt?: string | null;
        environments?: {
          nodes?: OrgEnvironmentSummary[];
        } | null;
      })
    | null;
};

type WhoamiData = {
  organization?: {
    name?: string;
    slug?: string;
  };
};

const ORGANIZATION_LIST_QUERY = `
  query CliOrganizationList {
    currentUser {
      organizations {
        nodes {
          id
          name
          slug
          currentPlan {
            id
            name
          }
          environments {
            nodes {
              id
              name
              slug
            }
          }
        }
      }
    }
  }
`;

const ORGANIZATION_SHOW_QUERY = `
  query CliOrganizationShow($organizationId: ID!) {
    organization(id: $organizationId) {
      id
      name
      slug
      lakehouseUser
      duckdbVersion
      altertableVersion
      createdAt
      currentPlan {
        id
        name
      }
      environments {
        nodes {
          id
          name
          slug
          cloudProvider
          cloudProviderAwsRegion
          cloudProviderHetznerRegion
        }
      }
    }
  }
`;

function requireOrgName(name: unknown): string {
  const trimmed = asCliArgString(name).trim();
  if (trimmed === "") {
    throw new CliError("An organization name is required.");
  }
  return trimmed;
}

function optionalEnvName(name: unknown): string | undefined {
  const trimmed = asCliArgString(name).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function listOrganizations(): Promise<OrgSummary[]> {
  const data = await managementGraphqlRequest<OrganizationListData>(ORGANIZATION_LIST_QUERY);
  return data.currentUser?.organizations?.nodes ?? [];
}

async function getCurrentOrganizationSlug(): Promise<string> {
  const data = parseApiJson(await managementRequest("GET", "/whoami")) as WhoamiData;
  return data.organization?.slug || getActiveProfileName();
}

function organizationLabel(org: OrgSummary): string {
  if (org.name && org.slug) {
    return `${org.name} (${org.slug})`;
  }
  return org.name || org.slug || org.id || "";
}

function findOrganization(orgs: OrgSummary[], target: string): OrgSummary | undefined {
  return orgs.find((org) => org.id === target || org.slug === target || org.name === target);
}

function formatOrganizationDetail(org: NonNullable<OrganizationData["organization"]>): string {
  const environments = org.environments?.nodes ?? [];
  const fields: Array<[string, string]> = [
    ["Organization:", organizationLabel(org)],
    ["ID:", org.id ?? ""],
    ["Plan:", org.currentPlan?.name ?? ""],
    ["Lakehouse user:", org.lakehouseUser ?? ""],
    ["DuckDB:", org.duckdbVersion ?? ""],
    ["Altertable:", org.altertableVersion ?? ""],
    ["Created:", org.createdAt ?? ""],
  ];
  const lines = fields
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `  ${label.padEnd(16)} ${value}`);

  const environmentTable = renderFixedTableSection(
    environments,
    [
      { header: "ENV", cell: (env) => env.name || env.slug || env.id || "", style: "strong" },
      { header: "SLUG", cell: (env) => env.slug ?? "", style: "muted" },
      { header: "CLOUD", cell: (env) => formatEnvironmentCloudSummary(env), style: "muted" },
    ],
    "No environments found.",
  );

  return `${formatTerminalSection(lines)}\n\n${environmentTable}`;
}

const orgListCommand = defineAltertableCommand({
  meta: { name: "list", description: "List organizations" },
  async run({ sink }) {
    const orgs = await listOrganizations();
    const activeOrg = await getCurrentOrganizationSlug();
    const table = renderFixedTableSection(
      orgs,
      [
        { header: "ORG", cell: (org) => org.name || org.slug || org.id || "", style: "strong" },
        { header: "SLUG", cell: (org) => org.slug ?? "", style: "muted" },
        { header: "ACTIVE", cell: (org) => (org.slug === activeOrg ? "*" : ""), style: "subtle" },
        { header: "PLAN", cell: (org) => org.currentPlan?.name ?? "", style: "muted" },
        {
          header: "ENVS",
          cell: (org) => String(org.environments?.nodes?.length ?? 0),
          style: "muted",
        },
      ],
      "No organizations found.",
    );
    writeCommandOutput(
      {
        kind: "normalized",
        data: { orgs },
        humanText: table,
      },
      sink,
    );
  },
});

const orgShowCommand = defineAltertableCommand({
  meta: { name: "show", description: "Show organization" },
  args: {
    name: { type: "string", description: "Organization name (default: active organization)" },
  },
  async run({ args, sink }) {
    const target = args.name ? requireOrgName(args.name) : await getCurrentOrganizationSlug();
    const orgs = await listOrganizations();
    const summary = findOrganization(orgs, target);
    if (!summary?.id) {
      throw new ConfigurationError(`Organization not found: ${target}`);
    }
    const data = await managementGraphqlRequest<OrganizationData>(ORGANIZATION_SHOW_QUERY, {
      organizationId: summary.id,
    });
    const org = data.organization;
    if (!org) {
      throw new ConfigurationError(`Organization not found: ${target}`);
    }
    writeCommandOutput(
      {
        kind: "normalized",
        data: { org },
        humanText: formatOrganizationDetail(org),
      },
      sink,
    );
  },
});

const orgUseCommand = defineAltertableCommand({
  meta: { name: "use", description: "Set the active organization" },
  args: {
    name: { type: "positional", description: "Organization name", required: true },
    env: { type: "string", description: "Also set the active environment for this organization" },
  },
  async run({ args, sink }) {
    const orgName = requireOrgName(args.name);
    const env = optionalEnvName(args.env);
    const resolvedEnvironment = env
      ? await withProfileContextSync(orgName, () => validateEnvironment(env))
      : undefined;
    setActiveProfile(orgName);
    if (env && resolvedEnvironment) {
      withProfileContextSync(orgName, () =>
        configSet("api_key_env", resolvedEnvironment.slug ?? env),
      );
    }
    writeCommandOutput(
      {
        kind: "ack",
        data: {
          active_org: orgName,
          ...(env && resolvedEnvironment ? { environment: resolvedEnvironment.slug ?? env } : {}),
        },
        metadataMessage:
          env && resolvedEnvironment
            ? `Active organization set to ${orgName}; environment set to ${formatEnvironmentLabel(resolvedEnvironment, env)}.`
            : `Active organization set to ${orgName}.`,
      },
      sink,
    );
  },
});

const orgDeleteCommand = defineAltertableCommand({
  meta: { name: "delete", description: "Delete an organization" },
  args: {
    name: { type: "positional", description: "Organization name", required: true },
    yes: { type: "boolean", description: "Confirm deletion" },
  },
  run({ args, sink }) {
    if (!args.yes) {
      throw new CliError("Pass --yes to delete an organization.");
    }
    const orgName = requireOrgName(args.name);
    deleteProfile(orgName);
    writeCommandOutput(
      {
        kind: "ack",
        data: { deleted: orgName },
        metadataMessage: `Deleted organization ${orgName}.`,
      },
      sink,
    );
  },
});

export const orgCommand = defineAltertableCommand({
  meta: {
    name: "org",
    description: "Manage Altertable organizations.",
    examples: [
      "altertable org list",
      "altertable org use acme",
      "altertable org use acme --env production",
      "altertable org show acme",
    ],
  },
  subCommands: {
    list: orgListCommand,
    show: orgShowCommand,
    use: orgUseCommand,
    delete: orgDeleteCommand,
  },
});
