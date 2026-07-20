import { asCliArgString } from "@/lib/cli-args.ts";
import { getCliContext } from "@/context.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import type { ProfileInspect } from "@/lib/profile/model.ts";
import type { ConfigureAuthPlane } from "@/lib/profile-status.ts";
import { defaultPrompts, type Prompts } from "@/ui/prompts.ts";
import { profileSwitchOption } from "@/lib/profile/views.ts";
import {
  envConfigMode,
  getActiveProfileName,
  isFromEnvProfile,
  profileExists,
} from "@/lib/profile-store.ts";
import { listProfiles } from "@/lib/profile/model.ts";

export function requireProfileName(name: unknown): string {
  const trimmed = asCliArgString(name).trim();
  if (trimmed === "") throw new CliError("A profile name is required.");
  return trimmed;
}

export function optionalArg(value: unknown): string | undefined {
  const stringValue = asCliArgString(value).trim();
  return stringValue || undefined;
}

export function existingProfileName(name: string): string {
  const resolvable = isFromEnvProfile(name) ? envConfigMode() : profileExists(name);
  if (!resolvable) throw new ConfigurationError(`Profile not found: ${name}`);
  return name;
}

export function requireStoredProfileForExport(name: string): string {
  if (isFromEnvProfile(name)) {
    throw new CliError(
      "The active identity is configured through environment variables; there is no stored profile to export. Pass a profile name.",
    );
  }
  return existingProfileName(name);
}

export function profileNameArgOrActive(args: Record<string, unknown>): string {
  return args.name
    ? requireProfileName(args.name)
    : (getCliContext().profile ?? getActiveProfileName());
}

export function profileShowTargetName(args: Record<string, unknown>): string {
  return optionalArg(args.name) ?? getCliContext().profile ?? getActiveProfileName();
}

export function configuredVerificationPlanes(profile: ProfileInspect): ConfigureAuthPlane[] {
  const planes: ConfigureAuthPlane[] = [];
  if (profile.auth.management !== "none") planes.push("management");
  if (profile.auth.lakehouse !== "none") planes.push("lakehouse");
  return planes;
}

export async function promptProfileSwitch(prompts: Prompts = defaultPrompts): Promise<string> {
  const profiles = listProfiles();
  return prompts.readSelect(
    "Switch profile",
    profiles.map(profileSwitchOption),
    getActiveProfileName(),
  );
}
