import { assertNoEnvConfigMode, renameProfile } from "@/features/profile/model.ts";
import { requireProfileName } from "@/commands/profile/lib/profile.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileRenameCommand = defineCommand({
  meta: { name: "rename", description: "Rename a profile", hidden: true },
  args: {
    from: { type: "positional", description: "Current profile name", required: true },
    to: { type: "positional", description: "New profile name", required: true },
  },
  async run({ args, sink }) {
    const from = requireProfileName(args.from);
    const to = requireProfileName(args.to);
    assertNoEnvConfigMode();
    renameProfile(from, to);
    await writeCommandOutput(
      {
        kind: "ack",
        data: { renamed: true, from, to },
        metadataMessage: `Renamed profile ${from} to ${to}.`,
      },
      sink,
    );
  },
});
