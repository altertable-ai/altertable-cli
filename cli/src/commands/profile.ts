import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { configureRunShowForProfile, buildConfigureShowDataForProfile } from "@/lib/configure.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
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

const profileListCommand = defineAltertableCommand({
  meta: { name: "list", description: "List configured profiles" },
  run({ sink }) {
    const profiles = listProfiles();
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
    writeCommandOutput(
      {
        kind: "normalized",
        data: { profiles },
        humanText: table,
      },
      sink,
    );
  },
});

const profileShowCommand = defineAltertableCommand({
  meta: { name: "show", description: "Show profile configuration (secrets masked)" },
  args: {
    name: { type: "string", description: "Profile name (default: active profile)" },
  },
  async run({ args, sink }) {
    const profileName = args.name ? requireProfileName(args.name) : getActiveProfileName();
    if (!profileExists(profileName)) {
      throw new ConfigurationError(`Profile not found: ${profileName}`);
    }
    const profile = buildConfigureShowDataForProfile(profileName);
    writeCommandOutput(
      {
        kind: "normalized",
        data: { profile },
        humanText: configureRunShowForProfile(profileName),
      },
      sink,
    );
  },
});

const profileUseCommand = defineAltertableCommand({
  meta: { name: "use", description: "Set the active profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
  },
  run({ args, sink }) {
    const profileName = requireProfileName(args.name);
    setActiveProfile(profileName);
    writeCommandOutput(
      {
        kind: "ack",
        data: { active_profile: profileName },
        metadataMessage: `Active profile set to ${profileName}.`,
      },
      sink,
    );
  },
});

const profileDeleteCommand = defineAltertableCommand({
  meta: { name: "delete", description: "Delete a profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
    yes: { type: "boolean", description: "Confirm deletion" },
  },
  run({ args, sink }) {
    if (!args.yes) {
      throw new CliError("Pass --yes to delete a profile.");
    }
    const profileName = requireProfileName(args.name);
    deleteProfile(profileName);
    writeCommandOutput(
      {
        kind: "ack",
        data: { deleted: profileName },
        metadataMessage: `Deleted profile ${profileName}.`,
      },
      sink,
    );
  },
});

export const profileCommand = defineAltertableCommand({
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
