import { defineCommand } from "@/lib/command.ts";
import { assertNoEnvConfigMode } from "@/lib/profile/model.ts";
import { configureRunClear } from "@/lib/profile-configure-core.ts";

export const logoutCommand = defineCommand({
  metadata: {
    name: "logout",
    commandGroup: "platform",
    description: "Remove stored credentials and settings for all profiles.",
    examples: ["altertable logout"],
  },
  run({ sink }) {
    assertNoEnvConfigMode();
    configureRunClear(sink);
  },
});
