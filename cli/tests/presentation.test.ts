import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { buildApiOperationDetailsView } from "@/features/api/views.ts";
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

test("legacy presentation APIs do not return", async () => {
  const legacyNames = [
    "DisplayTableColumnStyle",
    "formatTerminalMarkdownLinks",
    "formatTerminalSection",
    "formatTerminalUrls",
    "linkifyUrls",
    "terminalAccent",
    "terminalDataType",
    "terminalError",
    "terminalHighlightCommands",
    "terminalHttpMethod",
    "terminalLink",
    "terminalMetadata",
    "terminalStrong",
    "terminalSubtle",
    "terminalSuccess",
    "terminalTimestamp",
    "terminalUrl",
    "terminalWarning",
  ];
  const sourceRoot = join(import.meta.dir, "..", "src");
  const glob = new Bun.Glob("**/*.ts");

  for await (const path of glob.scan(sourceRoot)) {
    const source = await Bun.file(join(sourceRoot, path)).text();
    for (const name of legacyNames) {
      expect(source).not.toContain(name);
    }
  }
});
