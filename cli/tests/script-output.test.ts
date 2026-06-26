import { describe, expect, test } from "bun:test";
import { renderQueryCsv, renderQueryJson } from "@/lib/lakehouse-client.ts";
import { renderQueryMarkdown } from "@/lib/query-format.ts";

describe("script output lossless guarantees", () => {
  test("CSV round-trips cells with commas, quotes, newlines, and Unicode", () => {
    const trickyValue = 'say "hello",\nworld — café';
    const result = {
      metadata: {},
      columns: ["label", "note"],
      rows: [{ label: trickyValue, note: "plain" }],
    };

    const csv = renderQueryCsv(result);
    expect(csv).toContain('""hello""');
    expect(csv).toContain("café");
    expect(csv).not.toContain("…");
    // Newlines inside quoted fields produce multi-line CSV; verify round-trip via split lines
    const lines = csv.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    const rejoined = lines.slice(1).join("\n");
    expect(rejoined.startsWith('"')).toBe(true);
    expect(rejoined).toContain("world — café");
  });

  test("JSON output preserves full cell values without truncation", () => {
    const longPayload = { nested: { value: "x".repeat(500) } };
    const result = {
      metadata: { init_time_ms: 42 },
      columns: ["payload"],
      rows: [{ payload: longPayload }],
    };

    const json = renderQueryJson(result);
    const parsed = JSON.parse(json) as { rows: Array<{ payload: { nested: { value: string } } }> };
    expect(parsed.rows[0]?.payload.nested.value).toBe(longPayload.nested.value);
    expect(json).not.toContain("…");
    expect(json).not.toContain("\u001b");
  });

  test("markdown escapes pipe characters in cells", () => {
    const result = {
      metadata: {},
      columns: ["label"],
      rows: [{ label: "a|b|c" }],
    };

    const output = renderQueryMarkdown(result, ["label"], {
      layout: "table",
      maxColumnWidth: 80,
      terminalWidth: 120,
    });
    expect(output).toContain("a\\|b\\|c");
    expect(output).not.toMatch(/\| a \|/);
  });
});
