import { expect, test } from "bun:test";
import { readDeclaredAppScope } from "@/commands/app/lib/declared-app.ts";

const factoryImport = 'import { defineDataApp as define } from "@altertable/data-app";';

function app(config: string): string {
  return `${factoryImport}\nconst app = define(${config});`;
}

test("reads scope through the published extractor, including import aliases and TSX", () => {
  expect(
    readDeclaredAppScope(`${app(`{
      scope: { organization: "acme", environment: "production" },
      queries: { counts: { statement: \`SELECT '{' AS brace\`, params: {} } },
    } as const`)}
    function View() { return <p>Don't panic</p>; }`),
  ).toEqual({ organization: "acme", environment: "production" });
});

test("validates scope shape after extraction", () => {
  for (const config of [
    "{}",
    "{ scope: null }",
    "{ scope: [] }",
    '{ scope: { organization: 1, environment: "production" } }',
    '{ scope: { organization: "acme" } }',
    '{ scope: { organization: "acme", environment: " " } }',
  ]) {
    expect(() => readDeclaredAppScope(app(config))).toThrow("scope.organization");
  }
});

test("reports extractor diagnostics for invalid declarations without executing source", () => {
  for (const source of [
    "export const app = 1;",
    "function defineDataApp(value) { return value; } defineDataApp({ scope: {} });",
    app("config"),
    app("{ scope }"),
    app('{ scope: { organization: "acme" + suffix, environment: "production" } }'),
    app("{ scope: {"),
  ]) {
    expect(() => readDeclaredAppScope(source)).toThrow("Could not extract the data app manifest.");
  }
  expect(
    readDeclaredAppScope(
      `throw new Error("must not execute");\n${app('{ scope: { organization: "acme", environment: "production" } }')}`,
    ),
  ).toEqual({ organization: "acme", environment: "production" });
  expect(() => readDeclaredAppScope(`${factoryImport}\nconst app = define(config);`)).toThrow("2:");
});
