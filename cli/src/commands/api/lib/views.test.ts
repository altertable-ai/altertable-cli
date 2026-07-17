import { afterEach, expect, test } from "bun:test";
import { buildApiOperationDetailsView } from "@/commands/api/lib/views.ts";
import { renderDocumentText } from "@/ui/renderers/terminal.ts";
import { setTerminalColorMode } from "@/ui/terminal/styles.ts";

afterEach(() => {
  setTerminalColorMode(undefined);
});

test("presentation documents carry semantics without terminal escapes", () => {
  setTerminalColorMode("always");
  const view = buildApiOperationDetailsView({
    operationId: "createDatabase",
    method: "POST",
    path: "/environments/{environment_id}/databases",
    parameters: ["environment_id"],
    summary: "Create a database",
  });
  const [section] = view.sections;
  const [block] = section?.blocks ?? [];

  expect(JSON.stringify(view)).not.toContain("\u001b");
  expect(block?.kind).toBe("rows");
  if (block?.kind === "rows") {
    expect(block.rows[0]).toEqual({
      label: "Operation:",
      value: [{ text: "createDatabase", style: "accent" }],
    });
  }
  expect(renderDocumentText(view)).toContain("\u001b[96mcreateDatabase\u001b[39m");
});
