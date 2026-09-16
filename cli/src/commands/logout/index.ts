import { defineCommand } from "@/lib/command.ts";
import { assertNoEnvConfigMode } from "@/lib/profile/model.ts";
import { configureRunClear } from "@/lib/profile-configure-core.ts";

export const logoutCommand = defineCommand({
  metadata: {
    name: "logout",
    commandGroup: "platform",
    description: "Remove stored credentials and settings for all profiles.",
    examples: ["altertable logout", "altertable logout --except-current"],
  },
  args: {
    "except-current": {
      type: "boolean",
      description: "Keep the current profile and remove every other profile",
    },
  },
  run({ args, sink }) {
    assertNoEnvConfigMode();
    configureRunClear(sink, { exceptCurrent: Boolean(args["except-current"]) });
  },
});
