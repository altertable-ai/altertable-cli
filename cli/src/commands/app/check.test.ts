import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAppProject, checkClientBundle } from "@/commands/app/check.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "altertable-app-check-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("data app contract", () => {
  test("rejects unbounded operations in the app process", async () => {
    mkdirSync(join(directory, "src"));
    mkdirSync(join(directory, ".altertable/runtime/src"), { recursive: true });
    writeFileSync(
      join(directory, "app.json"),
      JSON.stringify({
        schemaVersion: 1,
        title: "Test app",
        operations: { totals: {} },
      }),
    );
    writeFileSync(
      join(directory, ".altertable/runtime/src/appearance.ts"),
      "export function parseAppearance() {}",
    );
    writeFileSync(
      join(directory, "src/operations.ts"),
      "export const operations = { totals: { input: () => ({}), output: (value: unknown) => value, run: async () => ({}), policy: { maxQueryRows: 0, maxDurationMs: 0 } } };",
    );
    const failure = await checkAppProject(directory).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: "Data app validation failed." });
    writeFileSync(
      join(directory, "src/operations.ts"),
      "export const operations = { totals: { input: () => ({}), output: (value: unknown) => value, run: async () => ({}), policy: { maxQueryRows: 1, maxDurationMs: 1000 } } };",
    );
    await checkAppProject(directory);
  });

  test("rejects credential references in the built client", async () => {
    mkdirSync(join(directory, "dist"));
    writeFileSync(join(directory, "dist/index.html"), "<html></html>");
    writeFileSync(
      join(directory, "dist/index-test.js"),
      'console.log("ALTERTABLE_LAKEHOUSE_PASSWORD")',
    );
    expect(checkClientBundle(directory)).rejects.toThrow("credential environment reference");
    writeFileSync(
      join(directory, "dist/index-test.js"),
      'console.log("ALTERTABLE_DATA_PROXY_TOKEN")',
    );
    expect(checkClientBundle(directory)).rejects.toThrow("credential environment reference");
  });

  test("scans non-index client chunks and nested assets", async () => {
    mkdirSync(join(directory, "dist/chunks"), { recursive: true });
    writeFileSync(join(directory, "dist/index.html"), "<html></html>");
    writeFileSync(join(directory, "dist/index-test.js"), "console.log('safe')");
    writeFileSync(
      join(directory, "dist/chunks/report.js"),
      'console.log("ALTERTABLE_LAKEHOUSE_PASSWORD")',
    );

    expect(checkClientBundle(directory)).rejects.toThrow("chunks/report.js");
    writeFileSync(join(directory, "dist/chunks/report.js"), "console.log('private-value')");
    expect(checkClientBundle(directory, ["private-value"])).rejects.toThrow("chunks/report.js");
    writeFileSync(join(directory, "dist/chunks/report.js"), "console.log('safe')");
    writeFileSync(
      join(directory, "dist/server.js"),
      'console.log("ALTERTABLE_LAKEHOUSE_PASSWORD")',
    );
    await checkClientBundle(directory);
  });
});
