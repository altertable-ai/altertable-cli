import { readFileSync } from "node:fs";
import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { configureRunShowForProfile, buildConfigureShowDataForProfile } from "@/lib/configure.ts";
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
  type ProfileUpdate,
} from "@/lib/profile.ts";

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

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatProfileInspect(profile: ProfileInspect): string {
  return formatInfoList(
    [
      { label: "Profile", value: `${profile.name}${profile.active ? " (active)" : ""}` },
      { label: "Status", value: profile.status },
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
        { header: "NAME", cell: (profile) => profile.name, style: "strong" },
        { header: "ACTIVE", cell: (profile) => (profile.active ? "*" : ""), style: "subtle" },
        {
          header: "ORG",
          cell: (profile) => profile.organization ?? "",
          style: "muted",
        },
        {
          header: "ENV",
          cell: (profile) => profile.management_env ?? "",
          style: "muted",
        },
        {
          header: "AUTH",
          cell: (profile) => profile.auth ?? "",
          style: "string",
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
    return createProfile(input.name, input.update);
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
    return args.name ? requireProfileName(args.name) : getActiveProfileName();
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
    const profileName = args.name ? requireProfileName(args.name) : getActiveProfileName();
    if (!profileExists(profileName)) {
      throw new ConfigurationError(`Profile not found: ${profileName}`);
    }
    return profileName;
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
const profileSwitchCommand = createProfileUseCommand("profile.switch", "switch", true);

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
  meta: { name: "env", description: "Print shell exports for a profile", hidden: true },
  args: {
    name: { type: "positional", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return args.name ? requireProfileName(args.name) : getActiveProfileName();
  },
  value(profileName) {
    if (!profileExists(profileName)) {
      throw new ConfigurationError(`Profile not found: ${profileName}`);
    }
    return profileName;
  },
  present(profileName) {
    return {
      kind: "normalized",
      data: { profile: profileName, env: { ALTERTABLE_PROFILE: profileName } },
      humanText: `export ALTERTABLE_PROFILE=${JSON.stringify(profileName)}`,
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
      "altertable profile current",
      "altertable profile show --name acme_prod",
      "altertable --profile acme_staging context",
    ],
  },
  subCommands: {
    create: profileCreateCommand,
    list: profileListCommand,
    show: profileShowCommand,
    inspect: profileInspectCommand,
    use: profileUseCommand,
    switch: profileSwitchCommand,
    current: profileCurrentCommand,
    env: profileEnvCommand,
    update: profileUpdateCommand,
    rename: profileRenameCommand,
    export: profileExportCommand,
    import: profileImportCommand,
    delete: profileDeleteCommand,
  },
});
