import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { configureCredentialStatus } from "@/lib/configure-credential-status.ts";
import { type WhoamiResponse } from "@/lib/management-formatters.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import {
  activeContextToJson,
  buildActiveContext,
  formatActiveContextDetails,
  withAuthenticatedIdentity,
} from "@/lib/active-context.ts";

export const contextCommand = defineAltertableCommand({
  meta: {
    name: "context",
    description: "Show the active org, environment, and authenticated identity.",
    examples: ["altertable context", "altertable --json context"],
  },
  async run({ sink }) {
    let context = buildActiveContext();

    if (configureCredentialStatus().hasManagement) {
      const response = await managementRequest("GET", "/whoami");
      context = withAuthenticatedIdentity(context, parseApiJson(response) as WhoamiResponse);
    }

    writeCommandOutput(
      {
        kind: "normalized",
        data: activeContextToJson(context),
        humanText: formatActiveContextDetails(context),
      },
      sink,
    );
  },
});
