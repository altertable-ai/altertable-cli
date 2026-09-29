import { defineCommand } from "@/lib/command.ts";
import { appBuildCommand } from "@/commands/app/build.ts";
import { appCreateCommand } from "@/commands/app/create.ts";
import { appDevCommand } from "@/commands/app/dev.ts";
import { appCheckCommand } from "@/commands/app/check.ts";
import { appUpgradeCommand } from "@/commands/app/upgrade.ts";

export const appCommand = defineCommand({
  metadata: {
    name: "app",
    commandGroup: "platform",
    description: "Create, develop, check, build, and upgrade data apps.",
    examples: [
      "altertable app create my-app",
      "altertable app dev",
      "altertable app check",
      "altertable app build",
      "altertable app upgrade",
    ],
  },
  subcommands: {
    create: appCreateCommand,
    dev: appDevCommand,
    build: appBuildCommand,
    check: appCheckCommand,
    upgrade: appUpgradeCommand,
  },
});
