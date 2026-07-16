import { assertNoEnvConfigMode, setActiveProfile } from "@/lib/profile/model.ts";
import { requireProfileName } from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileUseCommand = defineCommand({
  meta: { name: "use", description: "Set the active profile" },
  args: { name: { type: "positional", description: "Profile name", required: true } },
  async run({ args, sink }) {
    const profileName = requireProfileName(args.name);
    assertNoEnvConfigMode();
    setActiveProfile(profileName);
    await writeCommandOutput(
      {
        kind: "ack",
        data: { active_profile: profileName },
        metadataMessage: `Active profile set to ${profileName}.`,
      },
      sink,
    );
  },
});
