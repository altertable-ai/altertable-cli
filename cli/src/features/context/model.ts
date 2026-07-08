import { getCliContext, setCliContext } from "@/context.ts";
import {
  buildConfigureShowData,
  configureCredentialStatus,
  lakehousePlaneStatusDetail,
  managementPlaneStatusDetail,
  type ConfigureShowData,
} from "@/features/configure/model.ts";
import type { WhoamiResponse } from "@/features/management/model.ts";
import { ensureProfileExists } from "@/lib/profile-store.ts";

function withProfileContextSync<T>(profileName: string | undefined, run: () => T): T {
  if (!profileName) {
    return run();
  }
  ensureProfileExists(profileName);
  const previous = getCliContext();
  setCliContext({ ...previous, profile: profileName });
  try {
    return run();
  } finally {
    setCliContext(previous);
  }
}

export type ActiveContext = {
  profile: string;
  environment?: string;
  data_plane: string;
  control_plane: string;
  management: string | null;
  lakehouse: string | null;
  credentialStatus: ReturnType<typeof configureCredentialStatus>;
  credentials: ConfigureShowData["credentials"];
  overrides: ConfigureShowData["overrides"];
  principal?: WhoamiResponse["principal"];
  organization?: WhoamiResponse["organization"];
};

function resolveEnvironment(showData: ConfigureShowData): string | undefined {
  const envOverride = process.env.ALTERTABLE_ENV;
  if (envOverride && envOverride.length > 0) {
    return envOverride;
  }
  const managementCredential = showData.credentials.management;
  return managementCredential.configured ? managementCredential.environment : undefined;
}

export function buildActiveContext(profileOverride?: string): ActiveContext {
  const profile = profileOverride ?? getCliContext().profile;

  return withProfileContextSync(profile, () => {
    const showData = buildConfigureShowData(profileOverride);
    const credentialStatus = configureCredentialStatus();

    return {
      profile: showData.profile,
      environment: resolveEnvironment(showData),
      data_plane: showData.data_plane,
      control_plane: showData.control_plane,
      management: managementPlaneStatusDetail(),
      lakehouse: lakehousePlaneStatusDetail(),
      credentialStatus,
      credentials: showData.credentials,
      overrides: showData.overrides,
    };
  });
}

export function withAuthenticatedIdentity(
  context: ActiveContext,
  whoami: WhoamiResponse,
): ActiveContext {
  return {
    ...context,
    principal: whoami.principal,
    organization: whoami.organization,
  };
}

export function activeContextToJson(context: ActiveContext): Record<string, unknown> {
  return {
    profile: context.profile,
    environment: context.environment ?? null,
    data_plane: context.data_plane,
    control_plane: context.control_plane,
    management: context.management,
    lakehouse: context.lakehouse,
    credentials: context.credentials,
    overrides: context.overrides,
    ...(context.principal !== undefined ? { principal: context.principal } : {}),
    ...(context.organization !== undefined ? { organization: context.organization } : {}),
  };
}
