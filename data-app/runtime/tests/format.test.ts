import { expect, test } from "bun:test";
import { formatNumber, formatCount, formatPercent } from "../src/format.ts";
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
