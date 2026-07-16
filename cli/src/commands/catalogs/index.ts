import { defineCommand } from "@/lib/command.ts";
import { catalogsCreateCommand } from "@/commands/catalogs/create.ts";
import { catalogsListCommand } from "@/commands/catalogs/list.ts";

export const catalogsCommand = defineCommand({
  meta: {
    name: "catalogs",
    commandGroup: "platform",
    description: "Manage catalogs (databases and connections) in the current environment.",
    examples: [
      "altertable catalogs list",
      "altertable catalogs create --engine altertable --name Analytics",
    ],
  },
  subCommands: {
    create: catalogsCreateCommand,
    list: catalogsListCommand,
  },
});
