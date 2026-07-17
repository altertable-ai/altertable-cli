import { describe, expect, test } from "bun:test";
import { formatRelativeTimestamp, formatTimestampWithRelative } from "@/lib/relative-time.ts";

const NOW_MS = Date.parse("2026-06-27T12:00:00.000Z");

describe("formatRelativeTimestamp", () => {
  test("returns null for invalid timestamps", () => {
    expect(formatRelativeTimestamp("not-a-date", NOW_MS)).toBeNull();
  });

  test("returns null outside the 30-day window", () => {
    expect(formatRelativeTimestamp("2025-01-01T00:00:00.000Z", NOW_MS)).toBeNull();
  });

  test("formats recent past timestamps", () => {
    expect(formatRelativeTimestamp("2026-06-27T11:58:00.000Z", NOW_MS)).toBe("2 minutes ago");
    expect(formatRelativeTimestamp("2026-06-27T11:59:50.000Z", NOW_MS)).toBe("just now");
    expect(formatRelativeTimestamp("2026-06-21T06:35:24.409Z", NOW_MS)).toBe("6 days ago");
  });

  test("formats near-future timestamps", () => {
    expect(formatRelativeTimestamp("2026-06-28T12:00:00.000Z", NOW_MS)).toBe("in 1 day");
    expect(formatRelativeTimestamp("2026-06-27T12:05:00.000Z", NOW_MS)).toBe("in 5 minutes");
  });
});

describe("formatTimestampWithRelative", () => {
  test("keeps absolute form and appends relative when relevant", () => {
    expect(formatTimestampWithRelative("2026-06-21T06:35:24.409Z", { nowMs: NOW_MS })).toBe(
      "2026-06-21T06:35:24.409Z 6 days ago",
    );
  });

  test("returns absolute only when relative is not relevant", () => {
    expect(formatTimestampWithRelative("2025-01-01T00:00:00.000Z", { nowMs: NOW_MS })).toBe(
      "2025-01-01T00:00:00.000Z",
    );
  });

  test("returns absolute only when includeRelative is false", () => {
    expect(
      formatTimestampWithRelative("2026-06-21T06:35:24.409Z", {
        nowMs: NOW_MS,
        includeRelative: false,
      }),
    ).toBe("2026-06-21T06:35:24.409Z");
  });
});
