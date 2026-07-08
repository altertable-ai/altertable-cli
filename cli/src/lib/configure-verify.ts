import { getCliContext } from "@/context.ts";
import { configGet } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { defineHttpOperation, type HttpOperationDescriptor } from "@/lib/http-operation.ts";
import { lakehouseVerifyOperation } from "@/lib/lakehouse-operations.ts";
import type { WhoamiResponse } from "@/features/management/model.ts";
import { formatWhoamiPrincipalLine } from "@/features/management/render.ts";
import type { OperationContext } from "@/lib/operation-command.ts";
import { runOperationPlan } from "@/lib/operation-effect.ts";
import { formatProgressStatus, startProgress } from "@/lib/progress.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import { resolveProfileName } from "@/lib/profile-store.ts";

export { configureCredentialStatus } from "@/features/configure/model.ts";

export type ConfigureAuthPlane = "management" | "lakehouse";

export type ConfigureVerifyError = {
  plane: ConfigureAuthPlane;
  message: string;
};

export type ConfigureVerifyResult = {
  profile: string;
  configured: ConfigureAuthPlane[];
  verified: Record<ConfigureAuthPlane, boolean>;
  errors: ConfigureVerifyError[];
};

const managementVerifyOperation = defineHttpOperation<void, string>({
  id: "management.verify",
  request: () => ({
    plane: "management",
    method: "GET",
    endpoint: "/whoami",
  }),
  decode: (body) => parseWhoamiPrincipalName(body),
});

function parseWhoamiPrincipalName(body: string): string {
  try {
    const data = JSON.parse(body) as WhoamiResponse;
    return formatWhoamiPrincipalLine(data);
  } catch {
    return "authenticated";
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof CliError || error instanceof Error) {
    return error.message;
  }
  return "Verification failed.";
}

type ConfigureVerifier = {
  progressLabel: string;
  failureLabel: string;
  operation: HttpOperationDescriptor<void, string>;
  successMessage: (result: string) => string;
};

const CONFIGURE_VERIFY_PLANES = {
  management: {
    progressLabel: "Verifying management API key",
    failureLabel: "Management API key verification failed.",
    operation: managementVerifyOperation,
    successMessage: (principalLine) => `Management API key verified (${principalLine}).`,
  },
  lakehouse: {
    progressLabel: "Verifying lakehouse credentials",
    failureLabel: "Lakehouse credentials verification failed.",
    operation: lakehouseVerifyOperation,
    successMessage: () => "Lakehouse credentials verified.",
  },
} satisfies Record<ConfigureAuthPlane, ConfigureVerifier>;

function createConfigureVerifyOperationContext(): OperationContext {
  const runtime = getCliRuntime();
  return {
    args: {},
    rawArgs: [],
    runtime,
    sink: runtime.output,
    execution: createExecutionContext(runtime),
  };
}

async function verifyPlane(plane: ConfigureAuthPlane, context: OperationContext): Promise<string> {
  const verifier = CONFIGURE_VERIFY_PLANES[plane];
  const result = await runOperationPlan(verifier.operation.plan(undefined, context), context);
  return verifier.successMessage(result);
}

export async function configureVerify(
  planes: ConfigureAuthPlane[],
): Promise<ConfigureVerifyResult> {
  refreshCliRuntimeContext(getCliContext());

  const result: ConfigureVerifyResult = {
    profile: resolveProfileName(getCliContext().profile),
    configured: [...planes],
    verified: { management: false, lakehouse: false },
    errors: [],
  };

  for (const plane of planes) {
    const verifier = CONFIGURE_VERIFY_PLANES[plane];
    const progress = startProgress(verifier.progressLabel);
    try {
      const successMessage = await verifyPlane(plane, createConfigureVerifyOperationContext());
      progress.done(formatProgressStatus("success", successMessage));
      result.verified[plane] = true;
    } catch (error) {
      progress.fail(formatProgressStatus("error", verifier.failureLabel));
      result.errors.push({ plane, message: getErrorMessage(error) });
    }
  }

  return result;
}

export function formatConfigureVerifyRemediation(plane: ConfigureAuthPlane): string {
  if (plane === "management") {
    const env = configGet("api_key_env") || "<name>";
    return `Check your API key and environment. Run: altertable configure management or altertable configure --api-key atm_xxx --env ${env}`;
  }
  return "Check your lakehouse username and password. Run: altertable configure lakehouse or altertable configure --user <u> --password <p>";
}
