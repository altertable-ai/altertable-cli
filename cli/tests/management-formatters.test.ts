import { describe, expect, test } from "bun:test";
import {
  formatCatalogsSummary,
  formatCatalogsTable,
  type CatalogRow,
} from "@/lib/management-formatters.ts";

const sampleRows: CatalogRow[] = [
  {
    type: "database",
    name: "ClickBench",
    slug: "ALT-1",
    engine: "altertable",
    catalog: "clickbench",
  },
  {
    type: "connection",
    name: "Prod PG",
    slug: "EXT-12",
    engine: "postgres",
    catalog: "prod_pg",
  },
];

describe("formatCatalogsTable", () => {
  test("shows full type labels and groups databases before connections", () => {
    const output = formatCatalogsTable(sampleRows);
    expect(output).toContain("SLUG");
    expect(output).toContain("ClickBench");
    expect(output).toContain("database");
    expect(output).toContain("connection");
    expect(output.indexOf("ClickBench")).toBeLessThan(output.indexOf("Prod PG"));

    const lines = output.split("\n");
    const blankLineIndex = lines.findIndex((line) => line.trim() === "");
    expect(blankLineIndex).toBeGreaterThan(0);
    expect(lines[blankLineIndex - 1]).toContain("ClickBench");
    expect(lines[blankLineIndex + 1]).toContain("Prod PG");
  });
});

describe("formatCatalogsSummary", () => {
  test("returns null for an empty list", () => {
    expect(formatCatalogsSummary([])).toBeNull();
  });

  test("summarizes database and connection counts", () => {
    expect(formatCatalogsSummary(sampleRows)).toBe("2 catalogs · 1 database · 1 connection");
  });
});
