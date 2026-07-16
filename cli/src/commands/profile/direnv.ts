import { buildProfileDirenvView } from "@/features/profile/views.ts";
import {
  profileNameArgOrActive,
  requireStoredProfileForExport,
} from "@/commands/profile/lib/profile.ts";
import { renderShellExportView } from "@/ui/shell/render.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileDirenvCommand = defineCommand({
  meta: { name: "direnv", description: "Print a .envrc snippet for a profile" },
  args: { name: { type: "positional", description: "Profile name (default: active profile)" } },
  async run({ args, sink }) {
    const profileName = requireStoredProfileForExport(profileNameArgOrActive(args));
    const view = buildProfileDirenvView(profileName);
    await writeCommandOutput(
      {
        kind: "normalized",
        data: { profile: profileName, env: view.env },
        humanText: renderShellExportView(view),
      },
      sink,
    );
  },
});
