import { defineOperationCommand } from "@/lib/operation-command.ts";
import { configureCredentialStatus } from "@/lib/configure-credential-status.ts";
import { type WhoamiResponse } from "@/lib/management-formatters.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import {
  activeContextToJson,
  buildActiveContext,
  formatActiveContextDetails,
  withAuthenticatedIdentity,
} from "@/lib/active-context.ts";
import { sendOperationHttp } from "@/lib/operation-transport.ts";

export const contextCommand = defineOperationCommand({
  meta: {
    name: "context",
    description: "Show the active profile, environment, and authenticated identity.",
    examples: ["altertable context", "altertable --json context"],
  },
  async run(_, { execution }) {
    let context = buildActiveContext();

    if (configureCredentialStatus().hasManagement) {
      const response = await sendOperationHttp(
        { plane: "management", method: "GET", endpoint: "/whoami" },
        execution,
      );
      context = withAuthenticatedIdentity(context, parseApiJson(response) as WhoamiResponse);
    }

    return context;
  },
  present(context) {
    return {
      kind: "normalized",
      data: activeContextToJson(context),
      humanText: formatActiveContextDetails(context),
    };
  },
});
