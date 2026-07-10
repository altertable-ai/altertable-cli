import type { CliContext } from "@/context.ts";
import { resolveWorkingProfile } from "@/lib/profile-store.ts";

// Pins the profile name resolved at bootstrap for the duration of a command.
// Endpoints and auth are intentionally NOT cached here — they are resolved from
// this profile at each request, so they can never desync from it.
export type CliSession = {
  profile: string;
};

export function createCliSession(context: CliContext): CliSession {
  return {
    profile: resolveWorkingProfile(context.profile),
  };
}
