import { expect, test } from "bun:test";
import { readDeclaredAppScope } from "@/commands/app/lib/declared-app.ts";

const hostedApp = `
import { defineDataApp } from "@altertable/data-app";
const dataApp = defineDataApp({
  title: "Sample counts",
  description: "Explore sample counts by group.",
  scope: { organization: "demo", environment: "sample" },
  queries: {
    sampleCountsByGroup: {
      statement: \`
SELECT '{' AS brace, \${groupName} AS group_name
WHERE $groupName = '' OR group_name = $groupName\`,
      params: { groupName: { defaultValue: "" } },
    },
  },
});
`;

const acmeScope = `defineDataApp({ scope: { organization: "acme", environment: "production" } });`;

test("reads a literal scope from a single-file data app", () => {
  expect(readDeclaredAppScope(hostedApp)).toEqual({
    organization: "demo",
    environment: "sample",
  });
  expect(
    readDeclaredAppScope(`
      const sample = "defineDataApp({ scope: { organization: \\"nope\\", environment: \\"nope\\" } })";
      // defineDataApp({ scope: { organization: "nope", environment: "nope" } })
      export const app = defineDataApp({
        queries: { counts: { statement: "select 1", params: {} } },
        scope: {
          organization: "acme",
          environment: "production",
        },
      });
    `),
  ).toEqual({ organization: "acme", environment: "production" });
  expect(
    readDeclaredAppScope(
      "defineDataApp({ scope: { organization : 'O\\'Brien', environment: \"prod\\\"east\" } })",
    ),
  ).toEqual({ organization: "O'Brien", environment: 'prod"east' });
});

test("reads the scope past JSX text, regular expressions, and escapes", () => {
  expect(
    readDeclaredAppScope(
      `function Hint(): JSX.Element { return <p>Don't panic</p>; }\n${acmeScope}`,
    ),
  ).toEqual({ organization: "acme", environment: "production" });
  expect(readDeclaredAppScope(`const quote = /"[}']/g;\n${acmeScope}`)).toEqual({
    organization: "acme",
    environment: "production",
  });
  expect(
    readDeclaredAppScope(
      `defineDataApp({ scope: { organization: "\\u0041cme", environment: "\\x70rod" } })`,
    ),
  ).toEqual({ organization: "Acme", environment: "prod" });
  expect(
    readDeclaredAppScope(
      `const total = 4 / 2; defineDataApp({ title: \`\${total} / \${"}"}\`, scope: { organization: "acme", environment: "production" } as const })`,
    ),
  ).toEqual({ organization: "acme", environment: "production" });
});

test("requires a literal defineDataApp scope", () => {
  expect(() => readDeclaredAppScope("export const app = 1;")).toThrow("defineDataApp");
  expect(() => readDeclaredAppScope("defineDataApp(config)")).toThrow("object literal");
  expect(() => readDeclaredAppScope("defineDataApp({ title: 'App', queries: {} })")).toThrow(
    "scope.organization",
  );
  expect(() =>
    readDeclaredAppScope(
      "const scope = { organization: 'acme', environment: 'production' }; defineDataApp({ scope })",
    ),
  ).toThrow("scope.organization");
  expect(() =>
    readDeclaredAppScope(
      "defineDataApp({ scope: { organization: 'acme' + suffix, environment: 'production' } })",
    ),
  ).toThrow("scope.organization");
  expect(() => readDeclaredAppScope("defineDataApp({ scope: {")).toThrow("could not be parsed");
});
