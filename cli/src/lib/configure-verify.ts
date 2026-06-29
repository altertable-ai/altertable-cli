import { getCliContext } from "@/context.ts";
import { configGet } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { buildLakehouseQueryPayload } from "@/lib/lakehouse-transport.ts";
import { formatWhoamiPrincipalLine, type WhoamiResponse } from "@/lib/management-formatters.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { sendOperationHttp } from "@/lib/operation-transport.ts";
import { formatProgressStatus, startProgress } from "@/lib/progress.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import { getActiveProfileName } from "@/lib/profile.ts";

export { configureCredentialStatus } from "@/lib/configure-credential-status.ts";

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

function getVerifyProgressLabel(plane: ConfigureAuthPlane): string {
  if (plane === "management") {
    return "Verifying management API key";
  }
  return "Verifying lakehouse credentials";
}

function getVerifyFailureLabel(plane: ConfigureAuthPlane): string {
  if (plane === "management") {
    return "Management API key verification failed.";
  }
  return "Lakehouse credentials verification failed.";
}

async function verifyPlane(plane: ConfigureAuthPlane): Promise<string> {
  if (plane === "management") {
    const body = await managementRequest("GET", "/whoami");
    const principalLine = parseWhoamiPrincipalName(body);
    return `Management API key verified (${principalLine}).`;
  }

  await sendOperationHttp(
    {
      plane: "lakehouse",
      method: "POST",
      endpoint: "/query",
      body: JSON.stringify(buildLakehouseQueryPayload("SELECT 1")),
      contentType: "application/json",
    },
    createExecutionContext(getCliRuntime()),
  );
  return "Lakehouse credentials verified.";
}

export async function configureVerify(
  planes: ConfigureAuthPlane[],
): Promise<ConfigureVerifyResult> {
  refreshCliRuntimeContext(getCliContext());

  const result: ConfigureVerifyResult = {
    profile: getActiveProfileName(),
    configured: [...planes],
    verified: { management: false, lakehouse: false },
    errors: [],
  };

  for (const plane of planes) {
    const progress = startProgress(getVerifyProgressLabel(plane));
    try {
      const successMessage = await verifyPlane(plane);
      progress.done(formatProgressStatus("success", successMessage));
      result.verified[plane] = true;
    } catch (error) {
      progress.fail(formatProgressStatus("error", getVerifyFailureLabel(plane)));
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
