import { inspectProfile } from "@/lib/profile/model.ts";
import { formatProfileInspectResult } from "@/lib/profile/render.ts";
import { profileInspectToJson } from "@/lib/profile/views.ts";
import { existingProfileName, profileShowTargetName } from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileShowCommand = defineCommand({
  metadata: { name: "show", description: "Show a profile's stored identity, auth, and endpoints" },
  args: {
    name: {
      type: "positional",
      description: "Profile name (default: selected or active profile)",
      required: false,
    },
  },
  async run({ args, runtime, sink }) {
    const profile = inspectProfile(existingProfileName(profileShowTargetName(args)));
    await writeCommandOutput(
      {
        kind: "normalized",
        data: profileInspectToJson(profile),
        humanText: formatProfileInspectResult(
          profile,
          !sink.json && !runtime.context.agent && process.stdin.isTTY === true,
        ),
      },
      sink,
    );
  },
});
