import { assertNoEnvConfigMode, deleteProfile } from "@/features/profile/model.ts";
import { CliError } from "@/lib/errors.ts";
import { requireProfileName } from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileDeleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete a profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
    yes: { type: "boolean", description: "Confirm deletion" },
  },
  async run({ args, sink }) {
    if (!args.yes) throw new CliError("Pass --yes to delete a profile.");
    const profileName = requireProfileName(args.name);
    assertNoEnvConfigMode();
    deleteProfile(profileName);
    await writeCommandOutput(
      {
        kind: "ack",
        data: { deleted: profileName },
        metadataMessage: `Deleted profile ${profileName}.`,
      },
      sink,
    );
  },
});
