import { defineArgs } from "@/lib/command.ts";

export const appendRunArgs = defineArgs({
  data: {
    type: "positional",
    description: "JSON object, array, or @file",
    required: true,
  },
  to: {
    type: "string",
    description: "Destination as catalog.schema.table",
    required: true,
  },
  sync: {
    type: "boolean",
    description: "Wait for the append operation to finish before returning",
  },
});

export const appendGroupArgs = defineArgs({
  ...appendRunArgs,
  data: { ...appendRunArgs.data, required: false },
  to: { ...appendRunArgs.to, required: false },
});
