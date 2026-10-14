import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { configGet } from "@/lib/config.ts";
import { readEnv } from "@/lib/env.ts";
import { isRecord } from "@/lib/object.ts";
import { isFromEnvProfile } from "@/lib/profile-store.ts";
import { ConfigurationError } from "@/lib/errors.ts";

type ProfileAppScope = {
  organization?: string;
  organizationName?: string;
  environment?: string;
};

export function assertAppScope(
  scope: unknown,
  profile: ProfileAppScope,
  source = "app.json",
): void {
  const { organization, environment } = isRecord(scope) ? scope : {};
  const hasValidScope =
    typeof organization === "string" &&
    Boolean(organization.trim()) &&
    typeof environment === "string" &&
    Boolean(environment.trim());
  const organizationMatches =
    !profile.organization ||
    organization === profile.organization ||
    organization === profile.organizationName;
  const environmentMatches = !profile.environment || environment === profile.environment;
  if (!hasValidScope || !organizationMatches || !environmentMatches) {
    throw new ConfigurationError(
      `${source} scope does not match the selected profile. Select the matching profile or update the app scope before querying.`,
    );
  }
}

export function profileAppScope(profile: string): ProfileAppScope {
  return {
    organization: configGet("organization_slug", profile).trim(),
    organizationName: configGet("organization_name", profile).trim(),
    environment: isFromEnvProfile(profile)
      ? readEnv("ALTERTABLE_ENV")
      : configGet("api_key_env", profile).trim(),
  };
}

export async function checkAppScope(directory: string, profile: string): Promise<void> {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(directory, "app.json"), "utf8"));
  } catch {
    throw new ConfigurationError("Cannot read a valid app.json for profile scope verification.");
  }
  assertAppScope(manifest?.scope, profileAppScope(profile));
}
