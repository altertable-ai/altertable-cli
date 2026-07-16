import { getCliRuntime } from "@/lib/runtime.ts";
import { createExecutionContext, type ExecutionContext } from "@/lib/execution-context.ts";
import { sendHttp } from "@/lib/http-request.ts";

export async function managementRequest(
  method: string,
  endpoint: string,
  body?: string,
  execution: ExecutionContext = createExecutionContext(getCliRuntime()),
): Promise<string> {
  return sendHttp(
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
