import { getCliContext, isJsonOutput } from "@/context.ts";
import { assertNoEnvConfigMode } from "@/lib/profile/model.ts";
import { setActiveProfile } from "@/lib/profile-store.ts";
import { CliError } from "@/lib/errors.ts";
import { promptProfileSwitch, requireProfileName } from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileSwitchCommand = defineCommand({
  meta: { name: "switch", description: "Interactively switch the active profile" },
  args: { name: { type: "positional", description: "Profile name", required: false } },
  async run({ args, sink }) {
    assertNoEnvConfigMode();
    let profileName = args.name ? requireProfileName(args.name) : undefined;
    if (!profileName) {
      if (isJsonOutput(getCliContext()) || getCliContext().agent || process.stdin.isTTY !== true) {
        throw new CliError("Interactive profile switch requires a TTY. Pass a profile name.");
      }
      profileName = await promptProfileSwitch();
    }
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
