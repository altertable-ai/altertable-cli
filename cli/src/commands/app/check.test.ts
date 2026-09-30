import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAppProject, checkClientBundle } from "@/commands/app/check.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "altertable-app-check-"));
  mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/core"), { recursive: true });
  mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/server"), { recursive: true });
  writeFileSync(
    join(directory, "node_modules/@altertable/data-app/package.json"),
    JSON.stringify({
      name: "@altertable/data-app",
      type: "module",
      exports: {
        "./appearance": "./dist/core/appearance.js",
        "./server": "./dist/server/index.js",
        "./server/bun": "./dist/server/local.js",
      },
    }),
  );
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("data app contract", () => {
  test("rejects unbounded or unchecked operations in the app process", async () => {
    mkdirSync(join(directory, "src"));
    mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/core"), { recursive: true });
    mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/server"), {
      recursive: true,
    });
    writeFileSync(
      join(directory, "app.json"),
      JSON.stringify({
        schemaVersion: 1,
        title: "Test app",
      }),
    );
    writeFileSync(
      join(directory, "node_modules/@altertable/data-app/dist/core/appearance.js"),
      "export function parseAppearance() {}",
    );
    writeFileSync(
      join(directory, "src/operations.ts"),
      "export const operations = { totals: { checks: [{}], input: () => ({}), output: (value: unknown) => value, run: async () => ({}), policy: { maxQueryRows: 0, maxDurationMs: 0 } } };",
    );
    const failure = await checkAppProject(directory).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: "Data app validation failed." });
    writeFileSync(
      join(directory, "src/operations.ts"),
      "export const operations = { totals: { checks: [], input: () => ({}), output: (value: unknown) => value, run: async () => ({}), policy: { maxQueryRows: 1, maxDurationMs: 1000 } } };",
    );
    expect(checkAppProject(directory)).rejects.toThrow("Data app validation failed.");
    writeFileSync(
      join(directory, "src/operations.ts"),
      "export const operations = { totals: { checks: [{}], input: () => ({}), output: (value: unknown) => value, run: async () => ({}), policy: { maxQueryRows: 1, maxDurationMs: 1000 } } };",
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

test("browser bundles reject value imports of operations but allow type imports", async () => {
  mkdirSync(join(directory, "src"));
  mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/core"), { recursive: true });
  mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/server"), { recursive: true });
  writeFileSync(join(directory, "app.json"), JSON.stringify({ schemaVersion: 1, title: "Test" }));
  writeFileSync(
    join(directory, "node_modules/@altertable/data-app/dist/core/appearance.js"),
    "export function parseAppearance() {}",
  );
  writeFileSync(
    join(directory, "src/operations.ts"),
    "export const operations = { totals: { checks: [{}], input: () => ({}), output: (v: unknown) => v, run: async () => ({}), policy: { maxQueryRows: 1, maxDurationMs: 1000 } } };",
  );
  writeFileSync(
    join(directory, "src/index.html"),
    '<script type="module" src="./main.ts"></script>',
  );
  writeFileSync(
    join(directory, "src/main.ts"),
    'import { operations } from "./operations.ts"; console.log(operations);',
  );
  const boundaryError = await checkAppProject(directory).catch((error: unknown) => error);
  expect(boundaryError).toMatchObject({ message: "Data app validation failed." });
  writeFileSync(
    join(directory, "src/main.ts"),
    'import type { operations } from "./operations.ts"; const name: keyof typeof operations = "totals"; console.log(name);',
  );
  await checkAppProject(directory);
});

test("lakehouse checks execute every declared input through public package exports", async () => {
  mkdirSync(join(directory, "src"));
  mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/core"), { recursive: true });
  mkdirSync(join(directory, "node_modules/@altertable/data-app/dist/server"), { recursive: true });
  writeFileSync(
    join(directory, "app.json"),
    JSON.stringify({ schemaVersion: 1, title: "Live check" }),
  );
  writeFileSync(
    join(directory, "node_modules/@altertable/data-app/dist/core/appearance.js"),
    "export function parseAppearance() {}",
  );
  writeFileSync(
    join(directory, "node_modules/@altertable/data-app/dist/server/local.js"),
    "export function localLakehouse() { return {}; }",
  );
  writeFileSync(
    join(directory, "node_modules/@altertable/data-app/dist/server/index.js"),
    `
    export function createDataHandler(operations) {
      return async (request) => {
        const input = await request.json();
        await operations.totals.run({}, input);
        return new Response("ok");
      };
    }
  `,
  );
  writeFileSync(
    join(directory, "src/operations.ts"),
    `
    import { appendFileSync } from "node:fs";
    export const operations = { totals: {
      checks: [{ day: 1 }, { day: 2 }], input: (value) => value, output: (value) => value,
      policy: { maxQueryRows: 1, maxDurationMs: 1000 },
      async run(context, input) { appendFileSync("executed.txt", String(input.day)); return input; },
    } };
  `,
  );
  await checkAppProject(directory);
  expect(Bun.file(join(directory, "executed.txt")).size).toBe(0);
  await checkAppProject(directory, {});
  expect(readFileSync(join(directory, "executed.txt"), "utf8")).toBe("12");
});

test.each(["@altertable/data-app/server", "@altertable/data-app/server/bun"])(
  "browser bundles reject the published %s entry even without credential strings",
  async (entry) => {
    mkdirSync(join(directory, "src"));
    writeFileSync(
      join(directory, "app.json"),
      JSON.stringify({ schemaVersion: 1, title: "Boundary" }),
    );
    writeFileSync(
      join(directory, "node_modules/@altertable/data-app/dist/core/appearance.js"),
      "export function parseAppearance() {}",
    );
    writeFileSync(
      join(directory, "node_modules/@altertable/data-app/dist/server/index.js"),
      "export const secretFreeHandler = 1;",
    );
    writeFileSync(
      join(directory, "node_modules/@altertable/data-app/dist/server/local.js"),
      "export const secretFreeHandler = 1;",
    );
    writeFileSync(
      join(directory, "src/operations.ts"),
      "export const operations = { test: { checks: [{}], input: v => v, output: v => v, run: async () => ({}), policy: { maxQueryRows: 1, maxDurationMs: 1000 } } };",
    );
    writeFileSync(
      join(directory, "src/index.html"),
      '<script type="module" src="./main.ts"></script>',
    );
    writeFileSync(
      join(directory, "src/main.ts"),
      `import { secretFreeHandler } from "${entry}"; console.log(secretFreeHandler);`,
    );
    expect(checkAppProject(directory)).rejects.toThrow("Data app validation failed.");
    writeFileSync(
      join(directory, "src/main.ts"),
      `import type { secretFreeHandler } from "${entry}"; console.log("browser safe");`,
    );
    await checkAppProject(directory);
  },
);
