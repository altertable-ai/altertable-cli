import { buildProfileShellExportView } from "@/lib/profile/views.ts";
import {
  profileNameArgOrActive,
  requireStoredProfileForExport,
} from "@/commands/profile/lib/profile.ts";
import { renderShellExportView } from "@/ui/shell/render.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileEnvCommand = defineCommand({
  metadata: { name: "env", description: "Print shell exports for a profile" },
  args: {
    name: {
      type: "positional",
      description: "Profile name (default: active profile)",
      required: false,
    },
  },
  async run({ args, sink }) {
    const profileName = requireStoredProfileForExport(profileNameArgOrActive(args));
    const view = buildProfileShellExportView(profileName);
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
