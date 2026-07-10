import type { CliContext } from "@/context.ts";
import { resolveWorkingProfile } from "@/lib/profile-store.ts";

// Endpoints and auth are intentionally NOT cached here — they resolve from this
// profile at each request, so they can never desync from it.
export type CliSession = {
  profile: string;
};

export function createCliSession(context: CliContext): CliSession {
  return {
    profile: resolveWorkingProfile(context.profile),
  };
}
