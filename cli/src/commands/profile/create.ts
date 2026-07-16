import {
  assertNoEnvConfigMode,
  createEmptyProfile,
  inspectProfile,
  setActiveProfile,
} from "@/features/profile/model.ts";
import { formatProfileInspect } from "@/features/profile/render.ts";
import {
  configureArgs,
  runProfileConfigure,
  type ConfigureCommandArgs,
} from "@/lib/profile-configure.ts";
import { requireProfileName } from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileCreateCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a profile and configure its credentials",
    examples: [
      "altertable profile create acme_prod --api-key atm_xxx --env production",
      "altertable profile create acme_staging --user alice --password secret",
      "altertable profile create acme_prod",
    ],
  },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
    ...configureArgs,
  },
  async run({ args, sink }) {
    const name = requireProfileName(args.name);
    assertNoEnvConfigMode();
    createEmptyProfile(name);
    await runProfileConfigure(args as ConfigureCommandArgs, sink, name);
    setActiveProfile(name);
    const profile = inspectProfile(name);
    await writeCommandOutput(
      { kind: "normalized", data: { profile }, humanText: formatProfileInspect(profile) },
      sink,
    );
  },
});
