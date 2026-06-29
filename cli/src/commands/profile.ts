import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { configureRunShowForProfile, buildConfigureShowDataForProfile } from "@/lib/configure.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { renderFixedTableSection } from "@/lib/table-format.ts";
import { formatTerminalUrls } from "@/lib/terminal-style.ts";
import {
  deleteProfile,
  getActiveProfileName,
  listProfiles,
  profileExists,
  setActiveProfile,
} from "@/lib/profile.ts";

function requireProfileName(name: unknown): string {
  const trimmed = asCliArgString(name).trim();
  if (trimmed === "") {
    throw new CliError("A profile name is required.");
  }
  return trimmed;
}

const profileListCommand = defineOperationCommand({
  meta: { name: "list", description: "List configured profiles" },
  run() {
    return listProfiles();
  },
  present(profiles) {
    const table = renderFixedTableSection(
      profiles,
      [
        { header: "NAME", cell: (profile) => profile.name, style: "strong" },
        { header: "ACTIVE", cell: (profile) => (profile.active ? "*" : ""), style: "subtle" },
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

const profileShowCommand = defineOperationCommand({
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
  run(profileName) {
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

const profileUseCommand = defineOperationCommand({
  meta: { name: "use", description: "Set the active profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
  },
  parse({ args }) {
    return requireProfileName(args.name);
  },
  run(profileName) {
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

const profileDeleteCommand = defineOperationCommand({
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
  run(profileName) {
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

export const profileCommand = defineOperationCommand({
  meta: {
    name: "profile",
    description: "Manage named configuration profiles.",
    examples: [
      "altertable profile list",
      "altertable profile use staging",
      "altertable profile show production",
    ],
  },
  subCommands: {
    list: profileListCommand,
    show: profileShowCommand,
    use: profileUseCommand,
    delete: profileDeleteCommand,
  },
});
