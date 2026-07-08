import {
  buildProfileInspectView,
  buildProfileListView,
  buildProfileStatusView,
  type ProfileStatusResult,
} from "@/features/profile/views.ts";
import type { ProfileInspect, ProfileSummary } from "@/features/profile/model.ts";
import { renderDocument } from "@/ui/renderers/terminal.ts";

export function formatProfileInspect(profile: ProfileInspect): string {
  return renderDocument(buildProfileInspectView(profile)).join("\n");
}

export function formatProfileStatus(result: ProfileStatusResult): string {
  return renderDocument(buildProfileStatusView(result)).join("\n");
}

export function formatProfileList(profiles: readonly ProfileSummary[]): string {
  return renderDocument(buildProfileListView(profiles)).join("\n");
}
