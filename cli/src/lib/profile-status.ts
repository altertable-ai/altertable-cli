import { configGet } from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { buildLakehouseVerifyRequest } from "@/lib/lakehouse/query.ts";
import type { WhoamiResponse } from "@/lib/management/model.ts";
import { formatWhoamiPrincipalLine } from "@/lib/management/render.ts";
import { sendHttp, type HttpRequest } from "@/lib/http-request.ts";
import { formatProgressStatus, startProgress } from "@/lib/progress.ts";

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

type ConfigureVerifier = {
  progressLabel: string;
  failureLabel: string;
  request: () => HttpRequest;
  parse?: (body: string) => string;
  successMessage: (result: string) => string;
};

const CONFIGURE_VERIFY_PLANES = {
  management: {
    progressLabel: "Verifying management API key",
    failureLabel: "Management API key verification failed.",
    request: () => ({ plane: "management", method: "GET", endpoint: "/whoami" }),
    parse: parseWhoamiPrincipalName,
    successMessage: (principalLine) => `Management API key verified (${principalLine}).`,
  },
  lakehouse: {
    progressLabel: "Verifying lakehouse credentials",
    failureLabel: "Lakehouse credentials verification failed.",
    request: buildLakehouseVerifyRequest,
    successMessage: () => "Lakehouse credentials verified.",
  },
} satisfies Record<ConfigureAuthPlane, ConfigureVerifier>;

async function verifyPlane(
  plane: ConfigureAuthPlane,
  execution: ExecutionContext,
): Promise<string> {
  const verifier: ConfigureVerifier = CONFIGURE_VERIFY_PLANES[plane];
  const response = await sendHttp(verifier.request(), execution);
  const result = verifier.parse ? verifier.parse(response) : response;
  return verifier.successMessage(result);
}

export async function configureVerify(
  planes: ConfigureAuthPlane[],
  execution: ExecutionContext,
): Promise<ConfigureVerifyResult> {
  const result: ConfigureVerifyResult = {
    profile: execution.profile,
    configured: [...planes],
    verified: { management: false, lakehouse: false },
    errors: [],
  };

  for (const plane of planes) {
    const verifier = CONFIGURE_VERIFY_PLANES[plane];
    const progress = startProgress(verifier.progressLabel);
    try {
      const successMessage = await verifyPlane(plane, execution);
      progress.done(formatProgressStatus("success", successMessage));
      result.verified[plane] = true;
    } catch (error) {
      progress.fail(formatProgressStatus("error", verifier.failureLabel));
      result.errors.push({ plane, message: getErrorMessage(error) });
    }
  }

  return result;
}

export function formatConfigureVerifyRemediation(
  plane: ConfigureAuthPlane,
  profileName: string,
): string {
  if (plane === "management") {
    const env = configGet("api_key_env", profileName) || "<name>";
    return `Check your API key and environment. Run: altertable profile --configure --scope management or altertable profile --configure --api-key atm_xxx --env ${env}`;
  }
  return "Check your lakehouse username and password. Run: altertable profile --configure --scope lakehouse or altertable profile --configure --user <u> --password <p>";
}
