export const QUERY_LAYOUT_OPTIONS = ["auto", "table", "line"] as const;

export type QueryLayout = (typeof QUERY_LAYOUT_OPTIONS)[number];

const QUERY_LAYOUTS = new Set<string>(QUERY_LAYOUT_OPTIONS);

export function isQueryLayout(value: string): value is QueryLayout {
  return QUERY_LAYOUTS.has(value);
}
