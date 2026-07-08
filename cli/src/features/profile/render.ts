import {
  buildProfileInspectView,
  buildProfileListView,
  buildProfileStatusView,
  type ProfileStatusResult,
} from "@/features/profile/views.ts";
import type { ProfileInspect, ProfileSummary } from "@/features/profile/model.ts";
import { renderDocumentText } from "@/ui/renderers/terminal.ts";

export function formatProfileInspect(profile: ProfileInspect): string {
  return renderDocumentText(buildProfileInspectView(profile));
}

export function formatProfileStatus(result: ProfileStatusResult): string {
  return renderDocumentText(buildProfileStatusView(result));
}

export function formatProfileList(profiles: readonly ProfileSummary[]): string {
  return renderDocumentText(buildProfileListView(profiles));
}
