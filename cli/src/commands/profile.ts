import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { configureRunShowForProfile } from "@/lib/configure.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
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
    if (sink.json) {
      sink.writeJson({ profiles });
      return;
    }

    if (profiles.length === 0) {
      sink.writeHuman("No profiles configured.");
      return;
    }

    const lines = ["NAME\tACTIVE\tENV\tDATA PLANE"];
    for (const profile of profiles) {
      const active = profile.active ? "*" : "";
      lines.push(
        `${profile.name}\t${active}\t${profile.management_env ?? ""}\t${profile.data_plane ?? ""}`,
      );
    }
    sink.writeHuman(lines.join("\n"));
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
    writeCommandOutput(
      {
        kind: "human",
        text: configureRunShowForProfile(profileName),
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
    if (sink.json) {
      sink.writeJson({ active_profile: profileName });
      return;
    }
    sink.writeMetadata([`Active profile set to ${profileName}.`]);
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
    if (sink.json) {
      sink.writeJson({ deleted: profileName });
      return;
    }
    sink.writeMetadata([`Deleted profile ${profileName}.`]);
  },
});

export const profileCommand = defineAltertableCommand({
  meta: {
    name: "profile",
    description: "Manage named configuration profiles.",
  },
  subCommands: {
    list: profileListCommand,
    show: profileShowCommand,
    use: profileUseCommand,
    delete: profileDeleteCommand,
  },
});
