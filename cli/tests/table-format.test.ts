import { afterEach, describe, expect, test } from "bun:test";
import {
  renderApiRoutesTable,
  renderApiRoutesTableSection,
  renderFixedTable,
  renderFixedTableSection,
} from "@/lib/table-format.ts";
import { setTerminalColorMode, getVisibleTextWidth } from "@/lib/terminal-style.ts";

const originalAltertableColor = process.env.ALTERTABLE_COLOR;
const originalStdoutIsTTY = process.stdout.isTTY;

afterEach(() => {
  setTerminalColorMode(undefined);
  if (originalAltertableColor === undefined) {
    delete process.env.ALTERTABLE_COLOR;
  } else {
    process.env.ALTERTABLE_COLOR = originalAltertableColor;
  }
  Object.defineProperty(process.stdout, "isTTY", {
    value: originalStdoutIsTTY,
    configurable: true,
  });
});

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

  test("inserts a blank line between grouped rows", () => {
    const output = renderFixedTable(
      [
        { group: "a", name: "first" },
        { group: "a", name: "second" },
        { group: "b", name: "third" },
      ],
      [{ header: "NAME", cell: (row) => row.name }],
      "No rows.",
      { groupBy: (row) => row.group },
    );
    const lines = output.split("\n");
    expect(lines).toEqual(["NAME  ", "first ", "second", "", "third "]);
  });

  test("shrinks flex columns when the table exceeds terminal width", () => {
    const output = renderFixedTable(
      [{ label: "abcdefghijklmnopqrstuvwxyz", code: "1234" }],
      [
        { header: "LABEL", cell: (row) => row.label, flex: true },
        { header: "CODE", cell: (row) => row.code },
      ],
      "No rows.",
      { terminalWidth: 20 },
    );
    expect(output).toContain("…");
    expect(output).toContain("1234");
  });

  test("wraps table output without a section title", () => {
    const output = renderFixedTableSection(
      [{ name: "default" }],
      [{ header: "NAME", cell: (row) => row.name }],
    );
    expect(output).toContain("NAME");
    expect(output).toContain("default");
  });

  test("sizes columns using visible width for wide characters", () => {
    const output = renderFixedTable(
      [{ label: "日本語", code: "x" }],
      [
        { header: "L", cell: (row) => row.label, flex: true },
        { header: "C", cell: (row) => row.code },
      ],
      "No rows.",
      { terminalWidth: 7 },
    );
    for (const line of output.split("\n")) {
      expect(getVisibleTextWidth(line)).toBeLessThanOrEqual(7);
    }
  });
});

describe("renderApiRoutesTable", () => {
  test("renders method, path, summary, and operation with summary on its own line", () => {
    const output = renderApiRoutesTable([
      {
        method: "POST",
        path: "/environments",
        operationId: "createEnvironment",
        summary: "Create an environment",
      },
    ]);

    expect(output).toContain("METHOD");
    expect(output).toContain("PATH");
    expect(output).not.toContain("OPERATION");
    expect(output).toContain("POST");
    expect(output).toContain("/environments");
    expect(output).toContain("createEnvironment");
    expect(output).toContain("Create an environment");
    expect(output.indexOf("Create an environment")).toBeGreaterThan(
      output.indexOf("/environments"),
    );
  });

  test("colorizes HTTP methods when terminal color is enabled", () => {
    process.env.ALTERTABLE_COLOR = "always";
    setTerminalColorMode("always");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    const output = renderApiRoutesTable([
      {
        method: "DELETE",
        path: "/items",
        operationId: "deleteItem",
        summary: "Delete an item",
      },
    ]);
    expect(output).toContain("\u001b[31mDELETE\u001b[39m");
  });

  test("stacks operation below path when the row does not fit the terminal width", () => {
    const output = renderApiRoutesTable(
      [
        {
          method: "POST",
          path: "/service_accounts/{service_account_id}/environments/{environment_id}/credentials",
          operationId: "createServiceAccountCredential",
          summary: "Create a credential for a service account (returns the password once)",
        },
      ],
      "No operations found.",
      { terminalWidth: 80 },
    );

    const lines = output.split("\n");
    expect(lines[1]).toContain("/service_accounts/");
    expect(lines[1]).not.toContain("createServiceAccountCredential");
    expect(lines[2]?.trimStart()).toMatch(/^createServiceAccountCredential/);
    expect(lines[3]).toContain("Create a credential for a service account");
  });

  test("truncates long paths on very narrow terminals", () => {
    const output = renderApiRoutesTable(
      [
        {
          method: "DELETE",
          path: "/service_accounts/{service_account_id}/environments/{environment_id}/credentials/{id}",
          operationId: "revokeServiceAccountCredential",
          summary: "Revoke a service account's credential",
        },
      ],
      "No operations found.",
      { terminalWidth: 40 },
    );

    expect(output).toContain("…");
    expect(output).toContain("revokeServiceAccountCredential");
  });

  test("inserts a blank line between routes with different path roots", () => {
    const output = renderApiRoutesTable([
      {
        method: "GET",
        path: "/environments/{id}",
        operationId: "getEnvironment",
        summary: "Get an environment by ID or slug",
      },
      {
        method: "POST",
        path: "/service_accounts",
        operationId: "createServiceAccount",
        summary: "Create a service account",
      },
    ]);

    const lines = output.split("\n");
    const environmentSummaryIndex = lines.findIndex((line) =>
      line.includes("Get an environment by ID or slug"),
    );
    const serviceAccountMethodIndex = lines.findIndex((line) => line.includes("/service_accounts"));
    expect(environmentSummaryIndex).toBeGreaterThanOrEqual(0);
    expect(serviceAccountMethodIndex).toBeGreaterThan(environmentSummaryIndex);
    expect(lines[serviceAccountMethodIndex - 1]).toBe("");
  });

  test("wraps route list without a section title", () => {
    const output = renderApiRoutesTableSection([
      {
        method: "GET",
        path: "/whoami",
        operationId: "whoami",
        summary: "Identify the authenticated principal",
      },
    ]);
    expect(output).not.toContain("API ROUTES");
    expect(output).toContain("METHOD");
    expect(output).toContain("/whoami");
  });
});
