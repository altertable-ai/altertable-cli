import { invariant } from "../../core/invariant.ts";

export function validateWidgetViews(views: readonly { id: string }[], selected: string) {
  const ids = new Set(views.map((view) => view.id));
  invariant(
    views.length > 0 && ids.size === views.length && views.every((view) => !!view.id.trim()),
    "Widget tab IDs must be nonempty and unique.",
  );
  invariant(ids.has(selected), `Unknown widget tab: ${selected}.`);
}
