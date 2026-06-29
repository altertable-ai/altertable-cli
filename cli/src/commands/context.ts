import { defineOperationCommand } from "@/lib/operation-command.ts";
import { httpEffect, valueEffect } from "@/lib/operation-effect.ts";
import { configureCredentialStatus } from "@/lib/configure-credential-status.ts";
import { type WhoamiResponse } from "@/lib/management-formatters.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import {
  activeContextToJson,
  buildActiveContext,
  formatActiveContextDetails,
  withAuthenticatedIdentity,
} from "@/lib/active-context.ts";

export const contextCommand = defineOperationCommand({
  id: "context.show",
  capabilities: ["management-http"],
  meta: {
    name: "context",
    description: "Show the active profile, environment, and authenticated identity.",
    examples: ["altertable context", "altertable --json context"],
  },
  run() {
    const context = buildActiveContext();

    if (!configureCredentialStatus().hasManagement) {
      return valueEffect(context);
    }

    return httpEffect({ plane: "management", method: "GET", endpoint: "/whoami" }, (response) =>
      withAuthenticatedIdentity(context, parseApiJson(response) as WhoamiResponse),
    );
  },
  present(context) {
    return {
      kind: "normalized",
      data: activeContextToJson(context),
      humanText: formatActiveContextDetails(context),
    };
  },
});
