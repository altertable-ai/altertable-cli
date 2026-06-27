import { pluralize } from "@/lib/pluralize.ts";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_TIMESTAMP_WINDOW_MS = 30 * DAY_MS;

export function formatRelativeTimestamp(
  isoTimestamp: string,
  nowMs: number = Date.now(),
): string | null {
  const parsedMs = Date.parse(isoTimestamp);
  if (Number.isNaN(parsedMs)) {
    return null;
  }

  const diffMs = nowMs - parsedMs;
  const absDiffMs = Math.abs(diffMs);
  if (absDiffMs > RELATIVE_TIMESTAMP_WINDOW_MS) {
    return null;
  }

  const isFuture = diffMs < 0;

  if (absDiffMs < 45 * SECOND_MS) {
    return isFuture ? "in a moment" : "just now";
  }

  const minutes = Math.round(absDiffMs / MINUTE_MS);
  if (absDiffMs < 45 * MINUTE_MS) {
    const label = pluralize(minutes, "minute");
    return isFuture ? `in ${minutes} ${label}` : `${minutes} ${label} ago`;
  }

  const hours = Math.round(absDiffMs / HOUR_MS);
  if (absDiffMs < 22 * HOUR_MS) {
    const label = pluralize(hours, "hour");
    return isFuture ? `in ${hours} ${label}` : `${hours} ${label} ago`;
  }

  const days = Math.round(absDiffMs / DAY_MS);
  const label = pluralize(days, "day");
  return isFuture ? `in ${days} ${label}` : `${days} ${label} ago`;
}

export function formatTimestampWithRelative(
  isoTimestamp: string,
  options: { nowMs?: number; includeRelative?: boolean } = {},
): string {
  const includeRelative = options.includeRelative ?? true;
  const relative =
    includeRelative === true ? formatRelativeTimestamp(isoTimestamp, options.nowMs) : null;
  if (relative === null) {
    return isoTimestamp;
  }
  return `${isoTimestamp} ${relative}`;
}
