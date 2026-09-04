import { VERSION } from "@/version.ts";
import {
  detectConfiguredProfileAuth,
  readProfileConfiguration,
  type ProfileAuth,
} from "@/lib/profile/model.ts";
import { envConfigMode } from "@/lib/profile-store.ts";
import { readEnv } from "@/lib/env.ts";
import { configGetGlobal, resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import { secretStoreDisplay } from "@/lib/secrets.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { buildLakehouseVerifyRequest } from "@/lib/lakehouse/query.ts";
import { parseWhoamiResponse } from "@/lib/management/model.ts";
import { formatWhoamiPrincipalLine } from "@/lib/management/render.ts";
import { parseLakehouseQueryResponse, type LakehouseRow } from "@/lib/lakehouse-ndjson.ts";
import { ParseError } from "@/lib/errors.ts";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckOutcome,
} from "@/commands/doctor/lib/model.ts";

function passOutcome(message: string, details?: Record<string, unknown>): DoctorCheckOutcome {
  return { status: "pass", message, details };
}

function failOutcome(
  message: string,
  code: string,
  remediation: string[],
  details?: Record<string, unknown>,
): DoctorCheckOutcome {
  return { status: "fail", message, code, remediation, details };
}

function profileSource(context: DoctorCheckContext): string {
  if (envConfigMode()) return "environment configuration";
  if (context.execution.cli.profile) return "--profile";
  if (readEnv("ALTERTABLE_PROFILE")) return "ALTERTABLE_PROFILE";
  return configGetGlobal("active_profile") ? "active profile" : "default profile";
}

function formatManagementIdentity(body: string): string {
  return formatWhoamiPrincipalLine(parseWhoamiResponse(body));
}

function rowContainsProbeValue(row: LakehouseRow): boolean {
  return Array.isArray(row) ? row.includes(1) : Object.values(row).includes(1);
}

function validateLakehouseProbeResponse(body: string): void {
  const result = parseLakehouseQueryResponse(body);
  if (!result.rows.some(rowContainsProbeValue)) {
    throw new ParseError("Lakehouse probe returned an unexpected result.", {
      details: "Expected SELECT 1 to return the numeric value 1.",
    });
  }
}

function managementCredentialRemediation(context: DoctorCheckContext): string[] {
  if (context.interactive) {
    return ["Run: altertable login", "Or run: altertable profile configure --scope management"];
  }
  return [
    `Run: printf '%s' "$KEY" | altertable profile configure --api-key-stdin --env <name>`,
    "Or set: ALTERTABLE_API_KEY and ALTERTABLE_ENV",
  ];
}

function lakehouseCredentialRemediation(context: DoctorCheckContext): string[] {
  if (context.interactive) {
    return ["Run: altertable login", "Or run: altertable profile configure --scope lakehouse"];
  }
  return [
    `Run: printf '%s' "$PASSWORD" | altertable profile configure --user <username> --password-stdin`,
    "Or set: ALTERTABLE_BASIC_AUTH_TOKEN or ALTERTABLE_LAKEHOUSE_USERNAME and ALTERTABLE_LAKEHOUSE_PASSWORD",
  ];
}

function checkManagementCredentialPresence(
  auth: ProfileAuth,
  context: DoctorCheckContext,
): DoctorCheckOutcome {
  if (auth.management === "none") {
    return failOutcome(
      "No management credentials configured.",
      "configuration_error",
      managementCredentialRemediation(context),
    );
  }
  return passOutcome(`Configured (${auth.management}).`, { auth: auth.management });
}

function checkLakehouseCredentialPresence(
  auth: ProfileAuth,
  context: DoctorCheckContext,
): DoctorCheckOutcome {
  if (auth.lakehouse === "none") {
    return failOutcome(
      "No lakehouse credentials configured.",
      "configuration_error",
      lakehouseCredentialRemediation(context),
    );
  }
  return passOutcome(`Configured (${auth.lakehouse}).`, { auth: auth.lakehouse });
}

function offlineSkipReason(context: DoctorCheckContext): string | undefined {
  return context.offline ? "Offline mode." : undefined;
}

export function createDoctorChecks(): DoctorCheck[] {
  let profileAuth: ProfileAuth | undefined;

  function requireProfileAuth(): ProfileAuth {
    if (!profileAuth) {
      throw new Error("Secret store check did not inspect profile authentication.");
    }
    return profileAuth;
  }

  return [
    {
      id: "cli.runtime",
      label: "CLI",
      run: () =>
        passOutcome(`v${VERSION} · ${process.platform} ${process.arch}`, {
          version: VERSION,
          platform: process.platform,
          arch: process.arch,
          runtime: `Bun ${process.versions.bun ?? Bun.version}`,
        }),
    },
    {
      id: "profile.configuration",
      label: "Profile",
      run: (context) => {
        const current = readProfileConfiguration(context.execution.profile);
        const source = profileSource(context);
        return passOutcome(`${current.name} (${source})`, {
          name: current.name,
          source,
          environment: current.environment,
          config_file: current.config_file,
          timestamps: current.timestamps,
          endpoints: {
            data_plane: resolveApiBase(current.name),
            control_plane: resolveManagementApiBase(current.name),
          },
        });
      },
      remediation: () => ["Run: altertable profile show"],
    },
    {
      id: "credentials.store",
      label: "Secret store",
      requires: ["profile.configuration"],
      run: (context) => {
        profileAuth = detectConfiguredProfileAuth(context.execution.profile);
        if (envConfigMode()) {
          return passOutcome("Credentials supplied by environment variables.");
        }
        const store = secretStoreDisplay();
        return passOutcome(`${store} accessible.`, { store });
      },
      remediation: () => ["Run: altertable profile show"],
    },
    {
      id: "management.credentials",
      label: "Management auth",
      requires: ["credentials.store"],
      run: (context) => checkManagementCredentialPresence(requireProfileAuth(), context),
    },
    {
      id: "management.api",
      label: "Management API",
      requires: ["management.credentials"],
      skip: offlineSkipReason,
      async run(context) {
        const endpoint = resolveManagementApiBase(context.execution.profile);
        const body = await sendHttp(
          {
            plane: "management",
            method: "GET",
            endpoint: "/whoami",
            authRecovery: false,
          },
          context.execution,
        );
        const identity = formatManagementIdentity(body);
        return passOutcome(`${endpoint} · ${identity}`, { endpoint, identity });
      },
      remediation: (context) => [
        "Check the control-plane URL and management credentials.",
        ...managementCredentialRemediation(context),
      ],
    },
    {
      id: "lakehouse.credentials",
      label: "Lakehouse auth",
      requires: ["credentials.store"],
      run: (context) => checkLakehouseCredentialPresence(requireProfileAuth(), context),
    },
    {
      id: "lakehouse.api",
      label: "Lakehouse API",
      requires: ["lakehouse.credentials"],
      skip: offlineSkipReason,
      async run(context) {
        const endpoint = resolveApiBase(context.execution.profile);
        const body = await sendHttp(
          { ...buildLakehouseVerifyRequest(), authRecovery: false },
          context.execution,
        );
        validateLakehouseProbeResponse(body);
        return passOutcome(`${endpoint} · SELECT 1 succeeded.`, { endpoint });
      },
      remediation: (context) => [
        "Check the data-plane URL and lakehouse credentials.",
        ...lakehouseCredentialRemediation(context),
      ],
    },
  ];
}
