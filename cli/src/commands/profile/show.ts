import { inspectProfile } from "@/lib/profile/model.ts";
import { formatProfileInspect } from "@/lib/profile/render.ts";
import { existingProfileName, profileShowTargetName } from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileShowCommand = defineCommand({
  meta: { name: "show", description: "Show a profile's stored identity, auth, and endpoints" },
  args: { name: { type: "string", description: "Profile name (default: active profile)" } },
  async run({ args, sink }) {
    const profile = inspectProfile(existingProfileName(profileShowTargetName(args)));
    await writeCommandOutput(
      { kind: "normalized", data: { profile }, humanText: formatProfileInspect(profile) },
      sink,
    );
  },
});
