import { describe, expect, test } from "bun:test";
import { writeManagementOutput } from "@/lib/command-output.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";
import { extractManagementRows, renderManagementOutput } from "@/lib/management-output.ts";

describe("extractManagementRows", () => {
  test("extracts rows from list responses", () => {
    const rows = extractManagementRows({
      databases: [
        { id: "db_1", name: "Analytics" },
        { id: "db_2", name: "Prod DB" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Analytics");
  });

  test("extracts a single row from resource wrappers", () => {
    const rows = extractManagementRows({
      database: { id: "db_1", name: "Analytics" },
    });
    expect(rows).toEqual([{ id: "db_1", name: "Analytics" }]);
  });

  test("flattens credential create responses without exposing password", () => {
    const rows = extractManagementRows({
      credential: { id: "cred_1", label: "default" },
      password: "secret",
    });
    expect(rows).toEqual([{ id: "cred_1", label: "default", password: "[REDACTED]" }]);
  });
});

describe("renderManagementOutput", () => {
  const listBody = JSON.stringify({
    databases: [
      {
        id: "db_1",
        name: "Analytics",
        slug: "ALT-1",
        read_only: false,
        tags: [],
      },
      {
        id: "db_2",
        name: "Prod DB",
        slug: "ALT-2",
        read_only: true,
        tags: ["prod"],
      },
    ],
  });

  test("renders csv with header row", () => {
    const output = renderManagementOutput(listBody, "csv");
    const lines = output.split("\n");
    expect(lines[0]).toBe("id,name,read_only,slug,tags");
    expect(lines[1]).toContain("db_1");
    expect(lines[1]).toContain("Analytics");
    expect(lines[2]).toContain("Prod DB");
    expect(lines[2]).toContain("prod");
  });

  test("renders markdown table", () => {
    const output = renderManagementOutput(listBody, "markdown");
    expect(output).toContain("| id | name | read_only | slug | tags |");
    expect(output).toContain("| db_1 | Analytics | false | ALT-1 | [] |");
  });

  test("renders table output", () => {
    const output = renderManagementOutput(listBody, "table");
    expect(output).toContain("id");
    expect(output).toContain("Analytics");
    expect(output).toContain("Prod DB");
  });

  test("pretty-prints json", () => {
    const output = renderManagementOutput(listBody, "json");
    expect(JSON.parse(output)).toEqual(JSON.parse(listBody));
  });

  test("writeManagementOutput defaults to table in human mode", () => {
    const stdout: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false });
    runtime.output.writeHuman = (text) => {
      stdout.push(text);
    };
    runWithCliRuntime(runtime, () => {
      writeManagementOutput(listBody);
    });
    expect(stdout[0]).toContain("id");
    expect(stdout[0]).toContain("Analytics");
  });

  test("table format redacts credential password values", () => {
    const credentialBody = JSON.stringify({
      credential: { id: "cred_1", label: "default", username: "user_1" },
      password: "super-secret-password",
    });
    const output = renderManagementOutput(credentialBody, "table");
    expect(output).not.toContain("super-secret-password");
    expect(output).toContain("[REDACTED]");
  });
});
