import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseQueries, parseVariables } from "@/commands/app/lib/remote.ts";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from "@/test-utils/lakehouse.ts";

let workspace: LakehouseTestWorkspace;

beforeEach(() => {
  workspace = createLakehouseTestWorkspace("app-remote");
  process.env.ALTERTABLE_API_KEY = "atm_test";
  process.env.ALTERTABLE_ENV = "env-1";
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
});

afterEach(() => {
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  workspace.cleanup();
});

const INDEX_TSX = "export default function App() { return <div>Hello</div>; }\n";

function writeAppFiles() {
  const file = workspace.writeFile("index.tsx", INDEX_TSX);
  const queries = workspace.writeFile(
    "queries.json",
    JSON.stringify({ "top-stories": "SELECT id FROM stories WHERE score >= {{ min_score }}" }),
  );
  const variables = workspace.writeFile(
    "variables.json",
    JSON.stringify([{ name: "min_score", type: "integer", value: 10, nullable: false }]),
  );
  return { file, queries, variables };
}

describe("remote query and variable files", () => {
  test("accepts an id-to-sql object and a REST query array", () => {
    expect(parseQueries({ "top-stories": "SELECT 1" })).toEqual([
      { id: "top-stories", sql: "SELECT 1" },
    ]);
    expect(parseQueries([{ id: "top-stories", sql: "SELECT 1" }])).toEqual([
      { id: "top-stories", sql: "SELECT 1" },
    ]);
  });

  test("maps variable value to the REST default field", () => {
    expect(parseVariables([{ name: "min_score", type: "integer", value: 10 }])).toEqual([
      { name: "min_score", type: "integer", default: 10 },
    ]);
  });
});

describe("app validate", () => {
  test("posts the source from disk and exits non-zero when the API returns errors", async () => {
    const { file, queries, variables } = writeAppFiles();
    workspace.writeMocks([
      {
        urlPattern: "/data_apps/validate",
        method: "POST",
        body: JSON.stringify({
          errors: [{ message: "Unexpected token", line: 3, column: 7, source: "esbuild" }],
          warnings: [],
        }),
      },
    ]);

    const result = await runCommandWithTestRuntime(
      ["app", "validate", "--file", file, "--queries", queries, "--variables", variables],
      { debug: false, json: true, agent: false },
    );

    expect(result.exitCode).toBe(6);
    expect(JSON.parse(result.stdout[0]!)).toEqual({
      errors: [{ message: "Unexpected token", line: 3, column: 7, source: "esbuild" }],
      warnings: [],
    });
    expect(JSON.parse(workspace.readPayloads()[0]!)).toEqual({
      index_tsx: INDEX_TSX,
      queries: [
        { id: "top-stories", sql: "SELECT id FROM stories WHERE score >= {{ min_score }}" },
      ],
      variables: [{ name: "min_score", type: "integer", default: 10, nullable: false }],
    });
  });

  test("reports a valid app and defaults omitted variables to an empty array", async () => {
    const { file, queries } = writeAppFiles();
    workspace.writeMocks([
      {
        urlPattern: "/data_apps/validate",
        method: "POST",
        body: JSON.stringify({ errors: [], warnings: [] }),
      },
    ]);

    const result = await runCommandWithTestRuntime(
      ["app", "validate", "--file", file, "--queries", queries],
      { debug: false, json: false, agent: false },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("Data app is valid.");
    expect(JSON.parse(workspace.readPayloads()[0]!)).toMatchObject({ variables: [] });
  });
});

describe("app publish", () => {
  test("creates a data app from files", async () => {
    const { file, queries, variables } = writeAppFiles();
    workspace.writeMocks([
      {
        urlPattern: "/environments/env-1/data_apps",
        method: "POST",
        body: JSON.stringify({
          data_app: {
            slug: "APP-1",
            url: "https://app.example.com/apps/APP-1",
            title: "Revenue explorer",
          },
        }),
      },
    ]);

    const result = await runCommandWithTestRuntime(
      [
        "app",
        "publish",
        "--title",
        "Revenue explorer",
        "--file",
        file,
        "--queries",
        queries,
        "--variables",
        variables,
      ],
      { debug: false, json: true, agent: false },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toEqual({
      slug: "APP-1",
      url: "https://app.example.com/apps/APP-1",
    });
    expect(JSON.parse(workspace.readPayloads()[0]!)).toMatchObject({
      title: "Revenue explorer",
      index_tsx: INDEX_TSX,
    });
  });
});

describe("app update", () => {
  test("patches only the provided fields", async () => {
    const { file } = writeAppFiles();
    workspace.writeMocks([
      {
        urlPattern: "/data_apps/APP-1",
        method: "PATCH",
        body: JSON.stringify({
          data_app: { slug: "APP-1", url: "https://app.example.com/apps/APP-1", title: "Stories" },
        }),
      },
    ]);

    const result = await runCommandWithTestRuntime(["app", "update", "APP-1", "--file", file], {
      debug: false,
      json: true,
      agent: false,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toEqual({
      slug: "APP-1",
      url: "https://app.example.com/apps/APP-1",
    });
    expect(JSON.parse(workspace.readPayloads()[0]!)).toEqual({ index_tsx: INDEX_TSX });
  });

  test("requires at least one field to change", async () => {
    expect(runCommandWithTestRuntime(["app", "update", "APP-1"])).rejects.toThrow(
      "Provide at least one of --title, --description, --file, --queries, or --variables.",
    );
  });
});
