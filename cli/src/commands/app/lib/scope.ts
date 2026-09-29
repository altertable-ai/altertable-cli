import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { configGet } from "@/lib/config.ts";
import { readEnv } from "@/lib/env.ts";
import { isFromEnvProfile } from "@/lib/profile-store.ts";
import { ConfigurationError } from "@/lib/errors.ts";

export function assertAppScope(
  scope: unknown,
  profile: { organization?: string; organizationName?: string; environment?: string },
): void {
  const value = scope as { organization?: unknown; environment?: unknown } | null;
  if (
    !value ||
    typeof value.organization !== "string" ||
    !value.organization.trim() ||
    typeof value.environment !== "string" ||
    !value.environment.trim() ||
    (Boolean(profile.organization) &&
      ![profile.organization, profile.organizationName].includes(value.organization)) ||
    (Boolean(profile.environment) && value.environment !== profile.environment)
  ) {
    throw new ConfigurationError(
      "app.json scope does not match the selected profile. Select the matching profile or update the app scope before querying.",
    );
  }
}

export async function checkAppScope(directory: string, profile: string): Promise<void> {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(directory, "app.json"), "utf8"));
  } catch {
    throw new ConfigurationError("Cannot read a valid app.json for profile scope verification.");
  }
  assertAppScope(manifest?.scope, {
    organization: configGet("organization_slug", profile).trim(),
    organizationName: configGet("organization_name", profile).trim(),
    environment: isFromEnvProfile(profile)
      ? readEnv("ALTERTABLE_ENV")
      : configGet("api_key_env", profile).trim(),
  });
}
