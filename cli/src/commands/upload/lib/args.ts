import { defineArgs } from "@/lib/command.ts";
import { lakehouseFileArgs } from "@/lib/lakehouse/args.ts";

export const UPLOAD_MODE_OPTIONS = ["create", "append", "overwrite"] as const;

export const uploadArgs = defineArgs({
  ...lakehouseFileArgs,
  mode: {
    type: "enum",
    description: "create, append, or overwrite",
    required: true,
    options: [...UPLOAD_MODE_OPTIONS],
  },
});
