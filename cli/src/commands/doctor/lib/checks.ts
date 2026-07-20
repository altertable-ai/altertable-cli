import { VERSION } from "@/version.ts";
import {
  inspectProfileAuth,
  inspectProfileConfigurationReadOnly,
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

function pass(message: string, details?: Record<string, unknown>): DoctorCheckOutcome {
  return { status: "pass", message, details };
}

function fail(
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

function managementIdentity(body: string): string {
  return formatWhoamiPrincipalLine(parseWhoamiResponse(body));
}

function rowContainsProbeValue(row: LakehouseRow): boolean {
  return Array.isArray(row) ? row.includes(1) : Object.values(row).includes(1);
}

function validateLakehouseProbe(body: string): void {
  const result = parseLakehouseQueryResponse(body);
  if (!result.rows.some(rowContainsProbeValue)) {
    throw new ParseError("Lakehouse probe returned an unexpected result.", {
      details: "Expected SELECT 1 to return the numeric value 1.",
    });
  }
}

function checkManagementCredentials(auth: ProfileAuth): DoctorCheckOutcome {
  if (auth.management === "none") {
    return fail("No management credentials configured.", "configuration_error", [
      "Run: altertable login",
      "Or run: altertable profile configure --scope management",
    ]);
  }
  return pass(`Configured (${auth.management}).`, { auth: auth.management });
}

function checkLakehouseCredentials(auth: ProfileAuth): DoctorCheckOutcome {
  if (auth.lakehouse === "none") {
    return fail("No lakehouse credentials configured.", "configuration_error", [
      "Run: altertable login",
      "Or run: altertable profile configure --scope lakehouse",
    ]);
  }
  return pass(`Configured (${auth.lakehouse}).`, { auth: auth.lakehouse });
}

function networkSkip(context: DoctorCheckContext): string | undefined {
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
        pass(`v${VERSION} · ${process.platform} ${process.arch}`, {
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
        const current = inspectProfileConfigurationReadOnly(context.execution.profile);
        const source = profileSource(context);
        return pass(`${current.name} (${source})`, {
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
        profileAuth = inspectProfileAuth(context.execution.profile);
        if (envConfigMode()) {
          return pass("Credentials supplied by environment variables.");
        }
        const store = secretStoreDisplay();
        return pass(`${store} accessible.`, { store });
      },
      remediation: () => ["Run: altertable profile show"],
    },
    {
      id: "management.credentials",
      label: "Management auth",
      requires: ["credentials.store"],
      run: () => checkManagementCredentials(requireProfileAuth()),
    },
    {
      id: "management.api",
      label: "Management API",
      requires: ["management.credentials"],
      skip: networkSkip,
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
        const identity = managementIdentity(body);
        return pass(`${endpoint} · ${identity}`, { endpoint, identity });
      },
      remediation: () => [
        "Check the control-plane URL and management credentials.",
        "Run: altertable profile configure --scope management",
      ],
    },
    {
      id: "lakehouse.credentials",
      label: "Lakehouse auth",
      requires: ["credentials.store"],
      run: () => checkLakehouseCredentials(requireProfileAuth()),
    },
    {
      id: "lakehouse.api",
      label: "Lakehouse API",
      requires: ["lakehouse.credentials"],
      skip: networkSkip,
      async run(context) {
        const endpoint = resolveApiBase(context.execution.profile);
        const body = await sendHttp(
          { ...buildLakehouseVerifyRequest(), authRecovery: false },
          context.execution,
        );
        validateLakehouseProbe(body);
        return pass(`${endpoint} · SELECT 1 succeeded.`, { endpoint });
      },
      remediation: () => [
        "Check the data-plane URL and lakehouse credentials.",
        "Run: altertable profile configure --scope lakehouse",
      ],
    },
  ];
}
