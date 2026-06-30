import { defineOperationCommand } from "@/lib/operation-command.ts";
import { valuePlan } from "@/lib/operation-effect.ts";
import { configureCredentialStatus } from "@/lib/configure-credential-status.ts";
import {
  activeContextToJson,
  buildActiveContext,
  formatActiveContextDetails,
} from "@/lib/active-context.ts";
import { managementWhoamiOperation } from "@/lib/management-operations.ts";

export const contextCommand = defineOperationCommand({
  id: "context.show",
  capabilities: ["management-http"],
  catalog: { effects: ["value", "http"], planes: ["management"], output: "normalized" },
  meta: {
    name: "context",
    description: "Show the active profile, environment, and authenticated identity.",
    examples: ["altertable context", "altertable --json context"],
  },
  run(_input, operationContext) {
    const context = buildActiveContext();

    if (!configureCredentialStatus().hasManagement) {
      return valuePlan(context);
    }

    return managementWhoamiOperation.plan(context, operationContext);
  },
  present(context) {
    return {
      kind: "normalized",
      data: activeContextToJson(context),
      humanText: formatActiveContextDetails(context),
    };
  },
});
