import { getCliContext, setCliContext } from "@/context.ts";
import { inspectProfile } from "@/lib/profile/model.ts";
import { formatProfileStatus } from "@/lib/profile/render.ts";
import { profileStatusToJson } from "@/lib/profile/views.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import { refreshCliRuntimeContext } from "@/lib/runtime.ts";
import {
  configuredVerificationPlanes,
  existingProfileName,
  profileShowTargetName,
} from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileStatusCommand = defineCommand({
  meta: { name: "status", description: "Verify stored credentials and show the profile" },
  args: { name: { type: "string", description: "Profile name (default: active profile)" } },
  async run({ args, sink }) {
    const profileName = existingProfileName(profileShowTargetName(args));
    const previous = getCliContext();
    try {
      const next = { ...previous, profile: profileName };
      setCliContext(next);
      refreshCliRuntimeContext(next);
      const profile = inspectProfile(profileName);
      const verification = await configureVerify(configuredVerificationPlanes(profile));
      const result = { profile, verification };
      await writeCommandOutput(
        {
          kind: "normalized",
          data: profileStatusToJson(result),
          humanText: formatProfileStatus(result),
        },
        sink,
      );
    } finally {
      setCliContext(previous);
      refreshCliRuntimeContext(previous);
    }
  },
});
