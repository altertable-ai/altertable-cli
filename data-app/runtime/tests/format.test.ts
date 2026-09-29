import { expect, test } from "bun:test";
import { formatNumber, formatCount, formatPercent, formatDateRange } from "../src/format.ts";
test("number formatting distinguishes counts and ratios", () => {
  expect(formatNumber(12.345, { maximumFractionDigits: 2 })).toBe("12.35");
  expect(formatNumber(-0)).toBe("0");
  expect(formatCount(12_345)).toBe("12,345");
  expect(formatCount(12_345, { compact: true })).toBe("12.3K");
  expect(formatCount(12.5)).toBe("—");
  expect(formatPercent(0.116)).toBe("11.6%");
  expect(formatPercent(0.0012)).toBe("0.12%");
  expect(formatPercent(0.00002)).toBe("<0.01%");
  expect(formatPercent(null)).toBe("—");
});

test("calendar ranges stay compact without hiding their year", () => {
  expect(formatDateRange({ start: "2026-09-25", end: "2026-09-27" })).toBe("Sep 25–27, 2026");
  expect(formatDateRange({ start: "2026-08-30", end: "2026-09-28" })).toBe("Aug 30–Sep 28, 2026");
  expect(formatDateRange({ start: "2025-12-30", end: "2026-01-02" })).toBe(
    "Dec 30, 2025–Jan 2, 2026",
  );
  expect(formatDateRange({ start: "2026-09-28", end: "2026-09-28" })).toBe("Sep 28, 2026");
});
