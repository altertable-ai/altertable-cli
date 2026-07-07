import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { configureRunShowForProfile, buildConfigureShowDataForProfile } from "@/lib/configure.ts";
import {
  defineGroupCommand,
  defineLocalCommand,
  defineValueCommand,
} from "@/lib/operation-command-builders.ts";
import { renderFixedTableSection } from "@/lib/table-format.ts";
import { formatTerminalUrls } from "@/lib/terminal-style.ts";
import {
  deleteProfile,
  getActiveProfileName,
  listProfiles,
  profileExists,
  renameProfile,
  setActiveProfile,
} from "@/lib/profile.ts";

function requireProfileName(name: unknown): string {
  const trimmed = asCliArgString(name).trim();
  if (trimmed === "") {
    throw new CliError("A profile name is required.");
  }
  return trimmed;
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

function createProfileUseCommand(id: string, name: string) {
  return defineLocalCommand({
    id,
    mutates: true,
    localConfig: true,
    output: "normalized",
    meta: { name, description: "Set the active profile" },
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
const profileSwitchCommand = createProfileUseCommand("profile.switch", "switch");

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

const profileRenameCommand = defineLocalCommand({
  id: "profile.rename",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "rename", description: "Rename a profile" },
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
      "altertable profile use staging",
      "altertable profile switch acme_prod",
      "altertable profile current",
      "altertable profile show production",
    ],
  },
  subCommands: {
    list: profileListCommand,
    show: profileShowCommand,
    use: profileUseCommand,
    switch: profileSwitchCommand,
    current: profileCurrentCommand,
    rename: profileRenameCommand,
    delete: profileDeleteCommand,
  },
});
