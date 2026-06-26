import { writeJsonOrRaw } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { formatWhoami, type WhoamiResponse } from "@/lib/management-formatters.ts";
import { managementRequest } from "@/lib/management-transport.ts";

export const whoamiCommand = defineAltertableCommand({
  meta: {
    name: "whoami",
    description: "Show the authenticated principal and organization (management API).",
  },
  async run({ sink }) {
    const response = await managementRequest("GET", "/whoami");
    writeJsonOrRaw(response, (data) => formatWhoami(data as WhoamiResponse), sink);
  },
});
