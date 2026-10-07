import { defineCommand } from "@/lib/command.ts";
import { appBuildCommand } from "@/commands/app/build.ts";
import { appCreateCommand } from "@/commands/app/create.ts";
import { appDevCommand } from "@/commands/app/dev.ts";
import { appCheckCommand } from "@/commands/app/check.ts";
import { appPublishCommand } from "@/commands/app/publish.ts";
import { appUpdateCommand } from "@/commands/app/update.ts";
import { appUpgradeCommand } from "@/commands/app/upgrade.ts";
import { appValidateCommand } from "@/commands/app/validate.ts";

export const appCommand = defineCommand({
  metadata: {
    name: "app",
    commandGroup: "platform",
    description: "Create, develop, check, build, upgrade, and publish data apps.",
    examples: [
      "altertable app create my-app",
      "altertable app dev",
      "altertable app check",
      "altertable app build",
      "altertable app upgrade",
      "altertable app validate --file index.tsx --queries queries.json",
      "altertable app publish --title 'Revenue explorer' --file index.tsx --queries queries.json",
      "altertable app update APP-1 --file index.tsx",
    ],
  },
  subcommands: {
    create: appCreateCommand,
    dev: appDevCommand,
    build: appBuildCommand,
    check: appCheckCommand,
    upgrade: appUpgradeCommand,
    validate: appValidateCommand,
    publish: appPublishCommand,
    update: appUpdateCommand,
  },
});
