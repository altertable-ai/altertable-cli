import { getCliRuntime } from "@/lib/runtime.ts";
import { createExecutionContext, type ExecutionContext } from "@/lib/execution-context.ts";
import { sendOperationHttp } from "@/lib/operation-transport.ts";
export { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";

export async function managementRequest(
  method: string,
  endpoint: string,
  body?: string,
  execution: ExecutionContext = createExecutionContext(getCliRuntime()),
): Promise<string> {
  return sendOperationHttp(
    {
      plane: "management",
      method,
      endpoint,
      body,
      contentType: body ? "application/json" : undefined,
    },
    execution,
  );
}
