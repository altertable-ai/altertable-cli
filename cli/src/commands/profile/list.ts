import { listProfiles } from "@/lib/profile/model.ts";
import { formatProfileList } from "@/lib/profile/render.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";

export const profileListCommand = defineCommand({
  meta: { name: "list", description: "List configured profiles" },
  async run({ sink }) {
    const profiles = listProfiles();
    await writeCommandOutput(
      { kind: "normalized", data: { profiles }, humanText: formatProfileList(profiles) },
      sink,
    );
  },
});
