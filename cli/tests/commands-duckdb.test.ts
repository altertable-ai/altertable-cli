import { describe, expect, test } from "bun:test";
import { buildDuckdbAttachSnippet } from "@/commands/duckdb.ts";

describe("buildDuckdbAttachSnippet", () => {
  test("embeds credentials and catalog into the ATTACH connection string", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "alice", password: "s3cret" }, "sales");
    expect(snippet).toContain("INSTALL altertable FROM community;");
    expect(snippet).toContain("LOAD altertable;");
    expect(snippet).toContain("'user=alice password=s3cret catalog=sales'");
    expect(snippet).toContain('AS "sales" (TYPE ALTERTABLE);');
  });

  test("quotes the catalog identifier so a hyphen is not parsed as subtraction", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "alice", password: "s3cret" }, "my-catalog");
    expect(snippet).toContain('AS "my-catalog" (TYPE ALTERTABLE);');
  });

  test("escapes single quotes so a value cannot break out of the SQL string", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "a'b", password: "p'w" }, "c'at");
    expect(snippet).toContain("'user=a''b password=p''w catalog=c''at'");
  });

  test("escapes double quotes in the catalog identifier", () => {
    const snippet = buildDuckdbAttachSnippet({ user: "alice", password: "s3cret" }, 'we"ird');
    expect(snippet).toContain('AS "we""ird" (TYPE ALTERTABLE);');
  });
});
