import { getCliContext } from "@/context.ts";
import { defineCommand } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import { assertNoEnvConfigMode } from "@/lib/profile/model.ts";
import {
  configureArgs,
  runProfileConfigure,
  type ConfigureCommandArgs,
} from "@/lib/profile-configure.ts";
import { optionalArg } from "@/commands/profile/lib/profile.ts";

export const profileConfigureCommand = defineCommand({
  metadata: {
    name: "configure",
    description: "Create or update a profile's credentials and settings",
    examples: [
      "altertable profile configure",
      "altertable profile configure acme_production --api-key atm_xxx --env production",
      "altertable profile configure acme_staging --user alice --password-stdin",
      "altertable profile configure --scope lakehouse",
    ],
  },
  args: {
    name: {
      type: "positional",
      description: "Profile name (default: selected or active profile)",
      required: false,
    },
    ...configureArgs,
  },
  async run({ args, sink }) {
    assertNoEnvConfigMode();
    const explicitProfile = optionalArg(args.name);
    const selectedProfile = getCliContext().profile;
    if (explicitProfile && selectedProfile && explicitProfile !== selectedProfile) {
      throw new CliError(
        `Profile name "${explicitProfile}" does not match global --profile "${selectedProfile}".`,
      );
    }
    await runProfileConfigure(
      args as ConfigureCommandArgs,
      sink,
      explicitProfile ?? selectedProfile,
    );
  },
});
