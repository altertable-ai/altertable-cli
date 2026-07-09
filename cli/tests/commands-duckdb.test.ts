import { describe, expect, test } from "bun:test";
import { buildDuckdbAttachSnippet, selectCatalogsToAttach } from "@/commands/duckdb.ts";
import type { CatalogRow } from "@/features/management/model.ts";

function catalogRow(catalog: string): CatalogRow {
  return { type: "database", name: catalog, slug: catalog, engine: "altertable", catalog };
}

describe("buildDuckdbAttachSnippet", () => {
  test("embeds credentials and catalog into the ATTACH connection string", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "alice", password: "s3cret" }, ["sales"]);
    expect(snippet).toContain("INSTALL altertable FROM community;");
    expect(snippet).toContain("LOAD altertable;");
    expect(snippet).toContain("'user=alice password=s3cret catalog=sales'");
    expect(snippet).toContain('AS "sales" (TYPE ALTERTABLE);');
  });

  test("emits INSTALL/LOAD once and one ATTACH per catalog", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "alice", password: "s3cret" }, [
      "sales",
      "ops",
    ]);
    expect(snippet.match(/INSTALL altertable FROM community;/g)).toHaveLength(1);
    expect(snippet.match(/ATTACH/g)).toHaveLength(2);
    expect(snippet).toContain('AS "sales" (TYPE ALTERTABLE);');
    expect(snippet).toContain('AS "ops" (TYPE ALTERTABLE);');
  });

  test("quotes the catalog identifier so a hyphen is not parsed as subtraction", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "alice", password: "s3cret" }, ["my-catalog"]);
    expect(snippet).toContain('AS "my-catalog" (TYPE ALTERTABLE);');
  });

  test("escapes single quotes so a value cannot break out of the SQL string", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "a'b", password: "p'w" }, ["c'at"]);
    expect(snippet).toContain("'user=a''b password=p''w catalog=c''at'");
  });

  test("escapes double quotes in the catalog identifier", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "alice", password: "s3cret" }, ['we"ird']);
    expect(snippet).toContain('AS "we""ird" (TYPE ALTERTABLE);');
  });
});

describe("selectCatalogsToAttach", () => {
  const rows = [catalogRow("sales"), catalogRow("ops"), catalogRow("")];

  test("returns every non-empty catalog when none is requested", () => {
    expect(selectCatalogsToAttach(rows, undefined)).toEqual(["sales", "ops"]);
  });

  test("deduplicates repeated catalog values", () => {
    expect(selectCatalogsToAttach([catalogRow("sales"), catalogRow("sales")], undefined)).toEqual([
      "sales",
    ]);
  });

  test("returns only the requested catalog when it exists", () => {
    expect(selectCatalogsToAttach(rows, "ops")).toEqual(["ops"]);
  });

  test("throws when the requested catalog is not available", () => {
    expect(() => selectCatalogsToAttach(rows, "missing")).toThrow(/not found/);
  });

  test("throws when there are no catalogs to attach", () => {
    expect(() => selectCatalogsToAttach([], undefined)).toThrow(/No catalogs found/);
  });
});
