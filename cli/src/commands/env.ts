import { asCliArgString } from "@/lib/cli-args.ts";
import { getCliContext } from "@/context.ts";
import { configGet, configSet } from "@/lib/config.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { CliError } from "@/lib/errors.ts";
import { getActiveProfileName } from "@/lib/profile.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { managementGraphqlRequest } from "@/lib/management-graphql.ts";
import { renderFixedTableSection } from "@/lib/table-format.ts";
import { formatTerminalSection } from "@/lib/terminal-style.ts";

type EnvironmentLookupResponse = {
  environment?: {
    id?: string;
    name?: string;
    slug?: string;
    cloud_provider?: string | null;
    cloud_provider_region?: string | null;
    cloudProvider?: string | null;
    cloudProviderAwsRegion?: string | null;
    cloudProviderHetznerRegion?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
};

type EnvironmentGraphql = {
  id?: string;
  name?: string;
  slug?: string;
  cloudProvider?: string | null;
  cloudProviderAwsRegion?: string | null;
  cloudProviderHetznerRegion?: string | null;
};

type OrganizationListData = {
  currentUser?: {
    organizations?: {
      nodes?: Array<{
        id?: string;
        name?: string;
        slug?: string;
      }>;
    } | null;
  } | null;
};

type OrganizationEnvironmentsData = {
  organization?: {
    id?: string;
    name?: string;
    slug?: string;
    environments?: {
      nodes?: EnvironmentGraphql[];
    } | null;
  } | null;
};

type WhoamiData = {
  organization?: {
    slug?: string;
  };
};

const ORGANIZATION_LIST_QUERY = `
  query CliEnvironmentOrganizationList {
    currentUser {
      organizations {
        nodes {
          id
          name
          slug
        }
      }
    }
  }
`;

const ORGANIZATION_ENVIRONMENTS_QUERY = `
  query CliOrganizationEnvironments($organizationId: ID!) {
    organization(id: $organizationId) {
      id
      name
      slug
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

function requireEnvName(name: unknown): string {
  const trimmed = asCliArgString(name).trim();
  if (trimmed === "") {
    throw new CliError("An environment name is required.");
  }
  return trimmed;
}

async function getCurrentOrganizationSlug(): Promise<string> {
  const data = parseApiJson(await managementRequest("GET", "/whoami")) as WhoamiData;
  return data.organization?.slug || getActiveProfileName();
}

async function resolveCurrentOrganizationId(): Promise<string> {
  const currentSlug = await getCurrentOrganizationSlug();
  const data = await managementGraphqlRequest<OrganizationListData>(ORGANIZATION_LIST_QUERY);
  const org = data.currentUser?.organizations?.nodes?.find(
    (candidate) =>
      candidate.slug === currentSlug ||
      candidate.name === currentSlug ||
      candidate.id === currentSlug,
  );
  if (!org?.id) {
    throw new CliError(`Organization not found: ${currentSlug}`);
  }
  return org.id;
}

async function listCurrentOrganizationEnvironments(): Promise<{
  organization: NonNullable<OrganizationEnvironmentsData["organization"]>;
  environments: EnvironmentGraphql[];
}> {
  const organizationId = await resolveCurrentOrganizationId();
  const data = await managementGraphqlRequest<OrganizationEnvironmentsData>(
    ORGANIZATION_ENVIRONMENTS_QUERY,
    { organizationId },
  );
  const organization = data.organization;
  if (!organization) {
    throw new CliError("Organization not found.");
  }
  return { organization, environments: organization.environments?.nodes ?? [] };
}

const envUseCommand = defineAltertableCommand({
  meta: { name: "use", description: "Set the active environment for the active organization" },
  args: {
    name: { type: "positional", description: "Environment name or slug", required: true },
  },
  async run({ args, sink }) {
    const environment = requireEnvName(args.name);
    const resolvedEnvironment = await validateEnvironment(environment);
    configSet("api_key_env", resolvedEnvironment.slug ?? environment);
    writeCommandOutput(
      {
        kind: "ack",
        data: { org: getActiveProfileName(), environment: resolvedEnvironment.slug ?? environment },
        metadataMessage: `Active environment set to ${formatEnvironmentLabel(resolvedEnvironment, environment)}.`,
      },
      sink,
    );
  },
});

const envShowCommand = defineAltertableCommand({
  meta: { name: "show", description: "Show the active environment" },
  async run({ sink }) {
    const stored = configGet("api_key_env");
    const override = getCliContext().environment ?? process.env.ALTERTABLE_ENV;
    const environment = override || stored || null;
    const resolvedEnvironment = environment ? await validateEnvironment(environment) : null;
    writeCommandOutput(
      {
        kind: "normalized",
        data: {
          org: getActiveProfileName(),
          environment: resolvedEnvironment ?? environment,
          ...(override && override !== stored ? { override: "ALTERTABLE_ENV", stored } : {}),
        },
        humanText: resolvedEnvironment
          ? formatEnvironmentDetail(resolvedEnvironment, environment ?? "")
          : "Environment: not set",
      },
      sink,
    );
  },
});

const envListCommand = defineAltertableCommand({
  meta: { name: "list", description: "List environments for the current organization" },
  async run({ sink }) {
    const { organization, environments } = await listCurrentOrganizationEnvironments();
    const activeEnvironment =
      getCliContext().environment ?? process.env.ALTERTABLE_ENV ?? configGet("api_key_env");
    const table = renderFixedTableSection(
      environments,
      [
        { header: "ENV", cell: (env) => env.name || env.slug || env.id || "", style: "strong" },
        { header: "SLUG", cell: (env) => env.slug ?? "", style: "muted" },
        {
          header: "ACTIVE",
          cell: (env) => (env.slug === activeEnvironment ? "*" : ""),
          style: "subtle",
        },
        { header: "CLOUD", cell: (env) => formatEnvironmentCloudSummary(env), style: "muted" },
      ],
      "No environments found.",
    );
    writeCommandOutput(
      {
        kind: "normalized",
        data: { org: organization, environments },
        humanText: table,
      },
      sink,
    );
  },
});

export const envCommand = defineAltertableCommand({
  meta: {
    name: "env",
    description: "Manage the active environment for the current organization.",
    examples: ["altertable env list", "altertable env use production", "altertable env show"],
  },
  subCommands: {
    list: envListCommand,
    show: envShowCommand,
    use: envUseCommand,
  },
});

export async function validateEnvironment(environment: string): Promise<{
  id?: string;
  name?: string;
  slug?: string;
  cloud_provider?: string | null;
  cloud_provider_region?: string | null;
  cloudProvider?: string | null;
  cloudProviderAwsRegion?: string | null;
  cloudProviderHetznerRegion?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}> {
  const response = await managementRequest("GET", `/environments/${environment}`);
  const data = parseApiJson(response) as EnvironmentLookupResponse;
  return data.environment ?? { slug: environment };
}

export function formatEnvironmentLabel(
  environment: { name?: string; slug?: string },
  fallback: string,
): string {
  if (environment.name && environment.slug) {
    return `${environment.name} (${environment.slug})`;
  }
  return environment.name || environment.slug || fallback;
}

export function formatEnvironmentCloudSummary(env: {
  cloud_provider?: string | null;
  cloud_provider_region?: string | null;
  cloudProvider?: string | null;
  cloudProviderAwsRegion?: string | null;
  cloudProviderHetznerRegion?: string | null;
}): string {
  const provider = env.cloudProvider ?? env.cloud_provider;
  const region =
    env.cloudProviderHetznerRegion ?? env.cloudProviderAwsRegion ?? env.cloud_provider_region;
  if (!provider && !region) {
    return "";
  }
  return [formatCloudProvider(provider), formatCloudRegion(region)].filter(Boolean).join(" - ");
}

function formatEnvironmentDetail(
  environment: Awaited<ReturnType<typeof validateEnvironment>>,
  fallback: string,
): string {
  const fields: Array<[string, string]> = [
    ["Environment:", formatEnvironmentLabel(environment, fallback)],
    ["ID:", environment.id ?? ""],
    ["Cloud:", formatEnvironmentCloudSummary(environment)],
    ["Created:", environment.created_at ?? ""],
    ["Updated:", environment.updated_at ?? ""],
  ];
  const lines = fields
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `  ${label.padEnd(14)} ${value}`);
  return formatTerminalSection(lines);
}

function formatCloudProvider(provider: string | null | undefined): string {
  if (!provider) {
    return "";
  }
  const normalized = provider.toLowerCase();
  if (normalized === "hetzner") {
    return "Hetzner";
  }
  if (normalized === "aws") {
    return "AWS";
  }
  return provider;
}

function formatCloudRegion(region: string | null | undefined): string {
  if (!region) {
    return "";
  }
  const normalized = region.toLowerCase();
  if (normalized === "fsn1") {
    return "Falkenstein (fsn1)";
  }
  if (normalized === "eu_west_1" || normalized === "eu-west-1") {
    return "Ireland (eu-west-1)";
  }
  return region;
}
