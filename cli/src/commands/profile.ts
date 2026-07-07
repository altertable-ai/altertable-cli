import { readFileSync } from "node:fs";
import { asCliArgString } from "@/lib/cli-args.ts";
import { getCliContext, isJsonOutput, setCliContext } from "@/context.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { configureRunShowForProfile, buildConfigureShowDataForProfile } from "@/lib/configure.ts";
import type { ConfigureShowData } from "@/lib/configure-credential-status.ts";
import {
  configureVerify,
  type ConfigureAuthPlane,
  type ConfigureVerifyResult,
  formatConfigureVerifyRemediation,
} from "@/lib/configure-verify.ts";
import {
  defaultConfigurePrompts,
  type ConfigurePrompts,
  type ConfigureSelectOption,
} from "@/lib/configure-prompts.ts";
import {
  defineGroupCommand,
  defineLocalCommand,
  defineValueCommand,
} from "@/lib/operation-command-builders.ts";
import { formatInfoList } from "@/lib/info-list.ts";
import { renderFixedTableSection } from "@/lib/table-format.ts";
import { formatTerminalUrls, terminalAccent } from "@/lib/terminal-style.ts";
import {
  createProfile,
  deleteProfile,
  deriveProfileName,
  exportProfile,
  getActiveProfileName,
  importProfile,
  inspectProfile,
  listProfiles,
  profileExists,
  renameProfile,
  setActiveProfile,
  updateProfile,
  type ProfileInspect,
  type ProfileSummary,
  type ProfileUpdate,
} from "@/lib/profile.ts";
import { refreshCliRuntimeContext } from "@/lib/runtime.ts";

function requireProfileName(name: unknown): string {
  const trimmed = asCliArgString(name).trim();
  if (trimmed === "") {
    throw new CliError("A profile name is required.");
  }
  return trimmed;
}

function optionalArg(value: unknown): string | undefined {
  const stringValue = asCliArgString(value).trim();
  return stringValue || undefined;
}

function profileNameFromArgs(args: Record<string, unknown>): string {
  const explicitName = optionalArg(args.name);
  if (explicitName) {
    return explicitName;
  }
  const org = optionalArg(args.org);
  const env = optionalArg(args.env);
  if (org && env) {
    return deriveProfileName(org, env);
  }
  throw new CliError("A profile name is required, or pass --org and --env to derive one.");
}

function profileUpdateFromArgs(args: Record<string, unknown>): ProfileUpdate {
  return {
    organizationSlug: optionalArg(args.org),
    organizationName: optionalArg(args["org-name"]),
    environment: optionalArg(args.env),
    description: optionalArg(args.description),
    dataPlane: optionalArg(args["data-plane-url"]),
    controlPlane: optionalArg(args["control-plane-url"]),
  };
}

function existingProfileName(name: string): string {
  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }
  return name;
}

function profileNameArgOrActive(args: Record<string, unknown>): string {
  return args.name ? requireProfileName(args.name) : getActiveProfileName();
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatProfileInspect(profile: ProfileInspect): string {
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
  ].filter(Boolean);
  return parts.join(", ");
}

function profileShellExports(profileName: string): Record<"ALTERTABLE_PROFILE", string> {
  return { ALTERTABLE_PROFILE: profileName };
}

function formatShellExport(name: string, value: string): string {
  return `export ${name}=${JSON.stringify(value)}`;
}

type ProfileStatusResult = {
  profile: ProfileInspect;
  configuration: ConfigureShowData;
  verification?: ConfigureVerifyResult;
};

function configuredVerificationPlanes(configuration: ConfigureShowData): ConfigureAuthPlane[] {
  const planes: ConfigureAuthPlane[] = [];
  if (configuration.credentials.management.configured) {
    planes.push("management");
  }
  if (configuration.credentials.lakehouse.configured) {
    planes.push("lakehouse");
  }
  return planes;
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

function formatProfileStatus(result: ProfileStatusResult): string {
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

function profileSwitchOption(profile: ProfileSummary): ConfigureSelectOption {
  const details = [
    profile.active ? "active" : "",
    profile.organization ? `org: ${profile.organization}` : "",
    profile.management_env ? `env: ${profile.management_env}` : "",
    profile.principal ? `principal: ${profile.principal}` : "",
    profile.management_auth ? `management: ${profile.management_auth}` : "",
    profile.lakehouse_auth ? `lakehouse: ${profile.lakehouse_auth}` : "",
  ].filter(Boolean);
  return {
    value: profile.name,
    label: details.length > 0 ? `${profile.name} (${details.join(", ")})` : profile.name,
  };
}

export async function promptProfileSwitch(
  prompts: ConfigurePrompts = defaultConfigurePrompts,
): Promise<string> {
  const profiles = listProfiles();
  const activeProfile = getActiveProfileName();
  return await prompts.readSelect(
    "Switch profile",
    profiles.map(profileSwitchOption),
    activeProfile,
  );
}

const profileListCommand = defineValueCommand({
  id: "profile.list",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "list", description: "List configured profiles" },
  value() {
    return listProfiles();
  },
  present(profiles) {
    const table = renderFixedTableSection(
      profiles,
      [
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
      "No profiles configured.",
    );
    return {
      kind: "normalized",
      data: { profiles },
      humanText: table,
    };
  },
});

const profileCreateCommand = defineLocalCommand({
  id: "profile.create",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "create", description: "Create an empty profile with metadata" },
  args: {
    name: { type: "positional", description: "Profile name", required: false },
    org: { type: "string", description: "Organization slug" },
    "org-name": { type: "string", description: "Organization display name" },
    env: { type: "string", description: "Environment slug" },
    description: { type: "string", description: "Profile description" },
    "data-plane-url": { type: "string", description: "Data-plane base URL" },
    "control-plane-url": { type: "string", description: "Control-plane root URL" },
  },
  parse({ args }) {
    return {
      name: profileNameFromArgs(args),
      update: profileUpdateFromArgs(args),
    };
  },
  local(input) {
    createProfile(input.name, input.update);
    setActiveProfile(input.name);
    return inspectProfile(input.name);
  },
  present(profile) {
    return {
      kind: "normalized",
      data: { profile },
      humanText: formatProfileInspect(profile),
    };
  },
});

const profileUpdateCommand = defineLocalCommand({
  id: "profile.update",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: {
    name: "update",
    description: "Update profile metadata and endpoint overrides",
    hidden: true,
  },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
    org: { type: "string", description: "Organization slug" },
    "org-name": { type: "string", description: "Organization display name" },
    env: { type: "string", description: "Environment slug" },
    description: { type: "string", description: "Profile description" },
    "data-plane-url": { type: "string", description: "Data-plane base URL" },
    "control-plane-url": { type: "string", description: "Control-plane root URL" },
  },
  parse({ args }) {
    return {
      name: requireProfileName(args.name),
      update: profileUpdateFromArgs(args),
    };
  },
  local(input) {
    return updateProfile(input.name, input.update);
  },
  present(profile) {
    return {
      kind: "normalized",
      data: { profile },
      humanText: formatProfileInspect(profile),
    };
  },
});

const profileInspectCommand = defineValueCommand({
  id: "profile.inspect",
  capabilities: ["local-config"],
  output: "normalized",
  meta: {
    name: "inspect",
    description: "Inspect profile metadata, endpoints, and auth status",
    hidden: true,
  },
  args: {
    name: { type: "string", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return profileNameArgOrActive(args);
  },
  value(profileName) {
    return inspectProfile(profileName);
  },
  present(profile) {
    return {
      kind: "normalized",
      data: { profile },
      humanText: formatProfileInspect(profile),
    };
  },
});

const profileExportCommand = defineValueCommand({
  id: "profile.export",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "export", description: "Export a profile without secrets", hidden: true },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
  },
  parse({ args }) {
    return requireProfileName(args.name);
  },
  value(profileName) {
    return exportProfile(profileName);
  },
  present(exported) {
    return {
      kind: "normalized",
      data: exported,
      humanText: compactJson(exported),
    };
  },
});

const profileImportCommand = defineLocalCommand({
  id: "profile.import",
  mutates: true,
  localConfig: true,
  readFile: true,
  output: "normalized",
  meta: { name: "import", description: "Import a profile export without secrets", hidden: true },
  args: {
    file: { type: "positional", description: "Profile export JSON file", required: true },
    name: { type: "string", description: "Imported profile name override" },
  },
  parse({ args }) {
    return {
      file: asCliArgString(args.file),
      name: optionalArg(args.name),
    };
  },
  local(input) {
    const body = readFileSync(input.file, "utf8");
    try {
      return importProfile(JSON.parse(body), input.name);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigurationError("Profile import file is not valid JSON.");
      }
      throw error;
    }
  },
  present(profile) {
    return {
      kind: "normalized",
      data: { profile },
      humanText: formatProfileInspect(profile),
    };
  },
});

const profileShowCommand = defineValueCommand({
  id: "profile.show",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "show", description: "Show profile configuration (secrets masked)" },
  args: {
    name: { type: "string", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return existingProfileName(profileNameArgOrActive(args));
  },
  value(profileName) {
    const profile = buildConfigureShowDataForProfile(profileName);
    return { profileName, profile };
  },
  present(result) {
    return {
      kind: "normalized",
      data: { profile: result.profile },
      humanText: configureRunShowForProfile(result.profileName),
    };
  },
});

function createProfileUseCommand(id: string, name: string, hidden = false) {
  return defineLocalCommand({
    id,
    mutates: true,
    localConfig: true,
    output: "normalized",
    meta: { name, description: "Set the active profile", hidden },
    args: {
      name: { type: "positional", description: "Profile name", required: true },
    },
    parse({ args }) {
      return requireProfileName(args.name);
    },
    local(profileName) {
      setActiveProfile(profileName);
      return profileName;
    },
    present(profileName) {
      return {
        kind: "ack",
        data: { active_profile: profileName },
        metadataMessage: `Active profile set to ${profileName}.`,
      };
    },
  });
}

const profileUseCommand = createProfileUseCommand("profile.use", "use");
const profileSwitchCommand = defineLocalCommand<string | undefined, string>({
  id: "profile.switch",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "switch", description: "Interactively switch the active profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: false },
  },
  parse({ args }) {
    return args.name ? requireProfileName(args.name) : undefined;
  },
  async local(profileName) {
    if (!profileName) {
      if (isJsonOutput(getCliContext()) || getCliContext().agent || process.stdin.isTTY !== true) {
        throw new CliError("Interactive profile switch requires a TTY. Pass a profile name.");
      }
      profileName = await promptProfileSwitch();
    }
    setActiveProfile(profileName);
    return profileName;
  },
  present(profileName) {
    return {
      kind: "ack",
      data: { active_profile: profileName },
      metadataMessage: `Active profile set to ${profileName}.`,
    };
  },
});

const profileCurrentCommand = defineValueCommand({
  id: "profile.current",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "current", description: "Show the active profile name" },
  value() {
    return getActiveProfileName();
  },
  present(profileName) {
    return {
      kind: "normalized",
      data: { active_profile: profileName },
      humanText: profileName,
    };
  },
});

const profileEnvCommand = defineValueCommand({
  id: "profile.env",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "env", description: "Print shell exports for a profile" },
  args: {
    name: { type: "positional", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return existingProfileName(profileNameArgOrActive(args));
  },
  value(profileName) {
    return profileName;
  },
  present(profileName) {
    const env = profileShellExports(profileName);
    return {
      kind: "normalized",
      data: { profile: profileName, env },
      humanText: formatShellExport("ALTERTABLE_PROFILE", env.ALTERTABLE_PROFILE),
    };
  },
});

const profileDirenvCommand = defineValueCommand({
  id: "profile.direnv",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "direnv", description: "Print a .envrc snippet for a profile" },
  args: {
    name: { type: "positional", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return existingProfileName(profileNameArgOrActive(args));
  },
  value(profileName) {
    return profileName;
  },
  present(profileName) {
    const env = profileShellExports(profileName);
    return {
      kind: "normalized",
      data: { profile: profileName, env },
      humanText: [
        "# Generated by: altertable profile direnv",
        formatShellExport("ALTERTABLE_PROFILE", env.ALTERTABLE_PROFILE),
      ].join("\n"),
    };
  },
});

const profileStatusCommand = defineLocalCommand<
  { profileName: string; verify: boolean },
  ProfileStatusResult
>({
  id: "profile.status",
  localConfig: true,
  output: "normalized",
  meta: {
    name: "status",
    description: "Show profile auth status and optionally verify credentials",
  },
  args: {
    name: { type: "string", description: "Profile name (default: active profile)" },
    verify: { type: "boolean", description: "Verify configured credentials with live requests" },
  },
  parse({ args }) {
    return {
      profileName: profileNameArgOrActive(args),
      verify: Boolean(args.verify),
    };
  },
  async local(input) {
    existingProfileName(input.profileName);

    const previous = getCliContext();
    try {
      const next = { ...previous, profile: input.profileName };
      setCliContext(next);
      refreshCliRuntimeContext(next);
      const profile = inspectProfile(input.profileName);
      const configuration = buildConfigureShowDataForProfile(input.profileName);
      const planes = configuredVerificationPlanes(configuration);
      const verification = input.verify ? await configureVerify(planes) : undefined;
      return { profile, configuration, verification };
    } finally {
      setCliContext(previous);
      refreshCliRuntimeContext(previous);
    }
  },
  present(result) {
    return {
      kind: "normalized",
      data: result,
      humanText: formatProfileStatus(result),
    };
  },
});

const profileRenameCommand = defineLocalCommand({
  id: "profile.rename",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "rename", description: "Rename a profile", hidden: true },
  args: {
    from: { type: "positional", description: "Current profile name", required: true },
    to: { type: "positional", description: "New profile name", required: true },
  },
  parse({ args }) {
    return {
      from: requireProfileName(args.from),
      to: requireProfileName(args.to),
    };
  },
  local(input) {
    renameProfile(input.from, input.to);
    return input;
  },
  present(input) {
    return {
      kind: "ack",
      data: { renamed: true, from: input.from, to: input.to },
      metadataMessage: `Renamed profile ${input.from} to ${input.to}.`,
    };
  },
});

const profileDeleteCommand = defineLocalCommand({
  id: "profile.delete",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "delete", description: "Delete a profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
    yes: { type: "boolean", description: "Confirm deletion" },
  },
  parse({ args }) {
    if (!args.yes) {
      throw new CliError("Pass --yes to delete a profile.");
    }
    return requireProfileName(args.name);
  },
  local(profileName) {
    deleteProfile(profileName);
    return profileName;
  },
  present(profileName) {
    return {
      kind: "ack",
      data: { deleted: profileName },
      metadataMessage: `Deleted profile ${profileName}.`,
    };
  },
});

export const profileCommand = defineGroupCommand({
  id: "profile",
  capabilities: ["local-config"],
  meta: {
    name: "profile",
    description: "Manage named configuration profiles.",
    examples: [
      "altertable profile list",
      "altertable profile create acme_prod --org acme --env production",
      "altertable profile use acme_prod",
      "altertable profile switch",
      "altertable profile current",
      "altertable profile status --verify",
      "altertable profile show --name acme_prod",
      'eval "$(altertable profile env acme_staging)"',
      "altertable profile direnv acme_staging > .envrc",
      "altertable --profile acme_staging context",
    ],
  },
  subCommands: {
    create: profileCreateCommand,
    list: profileListCommand,
    show: profileShowCommand,
    status: profileStatusCommand,
    inspect: profileInspectCommand,
    use: profileUseCommand,
    switch: profileSwitchCommand,
    current: profileCurrentCommand,
    env: profileEnvCommand,
    direnv: profileDirenvCommand,
    update: profileUpdateCommand,
    rename: profileRenameCommand,
    export: profileExportCommand,
    import: profileImportCommand,
    delete: profileDeleteCommand,
  },
});
