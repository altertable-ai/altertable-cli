import { defineCommand } from "@/lib/command.ts";
import { configureRunClear } from "@/lib/profile-configure-core.ts";

export const logoutCommand = defineCommand({
  meta: {
    name: "logout",
    commandGroup: "platform",
    description: "Remove stored credentials and settings for all profiles.",
    examples: ["altertable logout"],
  },
  run({ sink }) {
    configureRunClear(sink);
  },
});
