import { inspectProfile } from "@/lib/profile/model.ts";
import { formatProfileStatus } from "@/lib/profile/render.ts";
import { profileStatusToJson } from "@/lib/profile/views.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import {
  configuredVerificationPlanes,
  existingProfileName,
  profileShowTargetName,
} from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileStatusCommand = defineCommand({
  metadata: { name: "status", description: "Verify stored credentials and show the profile" },
  args: {
    name: {
      type: "positional",
      description: "Profile name (default: selected or active profile)",
      required: false,
    },
  },
  async run({ args, execution, sink }) {
    const profileName = existingProfileName(profileShowTargetName(args));
    const profile = inspectProfile(profileName);
    const verification = await configureVerify(configuredVerificationPlanes(profile), {
      ...execution,
      profile: profileName,
    });
    const result = { profile, verification };
    await writeCommandOutput(
      {
        kind: "normalized",
        data: profileStatusToJson(result),
        humanText: formatProfileStatus(result),
      },
      sink,
    );
  },
});
