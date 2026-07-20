import { VERSION } from "@/version.ts";
import { inspectProfileReadOnly, type ProfileInspect } from "@/lib/profile/model.ts";
import { envConfigMode } from "@/lib/profile-store.ts";
import { readEnv } from "@/lib/env.ts";
import { configGetGlobal, resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import { secretStoreDisplay } from "@/lib/secrets.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { buildLakehouseVerifyRequest } from "@/lib/lakehouse/query.ts";
import type { WhoamiResponse } from "@/lib/management/model.ts";
import { formatWhoamiPrincipalLine } from "@/lib/management/render.ts";
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
  try {
    return formatWhoamiPrincipalLine(JSON.parse(body) as WhoamiResponse);
  } catch {
    return "authenticated";
  }
}

function managementCredentialCheck(profile: ProfileInspect): DoctorCheckOutcome {
  if (profile.auth.management === "none") {
    return fail("No management credentials configured.", "configuration_error", [
      "Run: altertable login",
      "Or run: altertable profile configure --scope management",
    ]);
  }
  return pass(`Configured (${profile.auth.management}).`, {
    auth: profile.auth.management,
    expires_at: profile.timestamps.oauth_expires_at,
  });
}

function lakehouseCredentialCheck(profile: ProfileInspect): DoctorCheckOutcome {
  if (profile.auth.lakehouse === "none") {
    return fail("No lakehouse credentials configured.", "configuration_error", [
      "Run: altertable login",
      "Or run: altertable profile configure --scope lakehouse",
    ]);
  }
  return pass(`Configured (${profile.auth.lakehouse}).`, {
    auth: profile.auth.lakehouse,
    expires_at: profile.timestamps.lakehouse_expires_at,
  });
}

function networkSkip(context: DoctorCheckContext): string | undefined {
  return context.offline ? "Offline mode." : undefined;
}

export function createDoctorChecks(): DoctorCheck[] {
  let inspectedProfile: ProfileInspect | undefined;
  const profile = (context: DoctorCheckContext): ProfileInspect => {
    inspectedProfile ??= inspectProfileReadOnly(context.execution.profile);
    return inspectedProfile;
  };

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
        const current = profile(context);
        const dataPlane = resolveApiBase(current.name);
        const controlPlane = resolveManagementApiBase(current.name);
        return pass(`${current.name} (${profileSource(context)})`, {
          name: current.name,
          source: profileSource(context),
          status: current.status,
          environment: current.environment,
          config_file: current.config_file,
          endpoints: {
            data_plane: dataPlane,
            control_plane: controlPlane,
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
        if (envConfigMode()) {
          return {
            status: "skipped",
            message: "Credentials supplied by environment variables.",
          };
        }
        profile(context);
        const store = secretStoreDisplay();
        return pass(`${store} accessible.`, { store });
      },
      remediation: () => ["Run: altertable profile show"],
    },
    {
      id: "management.credentials",
      label: "Management auth",
      requires: ["profile.configuration"],
      run: (context) => managementCredentialCheck(profile(context)),
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
      requires: ["profile.configuration"],
      run: (context) => lakehouseCredentialCheck(profile(context)),
    },
    {
      id: "lakehouse.api",
      label: "Lakehouse API",
      requires: ["lakehouse.credentials"],
      skip: networkSkip,
      async run(context) {
        const endpoint = resolveApiBase(context.execution.profile);
        await sendHttp(
          { ...buildLakehouseVerifyRequest(), authRecovery: false },
          context.execution,
        );
        return pass(`${endpoint} · SELECT 1 succeeded.`, { endpoint });
      },
      remediation: () => [
        "Check the data-plane URL and lakehouse credentials.",
        "Run: altertable profile configure --scope lakehouse",
      ],
    },
  ];
}
