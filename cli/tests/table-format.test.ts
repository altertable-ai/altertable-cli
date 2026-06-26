import { describe, expect, test } from "bun:test";
import { renderFixedTable } from "@/lib/table-format.ts";

describe("renderFixedTable", () => {
  test("computes column widths from header and cell values", () => {
    const output = renderFixedTable(
      [{ name: "Alice", role: "admin" }],
      [
        { header: "NAME", cell: (row) => row.name },
        { header: "ROLE", cell: (row) => row.role },
      ],
    );
    expect(output).toBe("NAME   ROLE \nAlice  admin");
  });

  test("truncates cells when maxWidth is set", () => {
    const output = renderFixedTable(
      [{ label: "abcdefghijklmnopqrstuvwxyz" }],
      [{ header: "LABEL", cell: (row) => row.label, maxWidth: 10 }],
    );
    expect(output).toContain("abcdefghi…");
    expect(output).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  test("returns empty message for no rows", () => {
    expect(renderFixedTable([], [{ header: "ID", cell: () => "" }], "No rows.")).toBe("No rows.");
  });
});
