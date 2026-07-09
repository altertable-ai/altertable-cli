import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

const userPrincipalMock = [
  {
    urlPattern: "/whoami",
    method: "GET",
    body: JSON.stringify({
      principal: { type: "User", name: "Jane Doe", email: "jane@x.io" },
      organization: { name: "Acme", slug: "acme" },
    }),
  },
];

const serviceAccountPrincipalMock = [
  {
    urlPattern: "/whoami",
    method: "GET",
    body: JSON.stringify({
      principal: { type: "ServiceAccount", name: "ci-bot", slug: "ci-bot" },
      organization: { name: "Acme", slug: "acme" },
    }),
  },
];

describe("altertable context", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: "atm_test",
      ALTERTABLE_ENV: undefined,
      ALTERTABLE_MANAGEMENT_API_BASE: undefined,
    });
  });

  afterAll(async () => {
    await workspace.cleanup();
  });

  test("formats a User principal", async () => {
    await workspace.setupMockHttp(userPrincipalMock);
    const result = await workspace.runCommand("altertable context");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Profile:");
    expect(result.stdout).toContain("User:");
    expect(result.stdout).toContain("Jane Doe <jane@x.io>");
    expect(result.stdout).toContain("Organization:");
    expect(result.stdout).toContain("Acme (acme)");
  });

  test("--no-color emits plain text without ANSI styling", async () => {
    await workspace.setupMockHttp(userPrincipalMock);
    const result = await workspace.runCommand("altertable --no-color context");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/\x1B/);
    expect(result.stdout).toContain("Jane Doe <jane@x.io>");
  });

  test("--agent returns structured session JSON", async () => {
    await workspace.setupMockHttp(userPrincipalMock);
    const result = await workspace.runCommand("altertable --agent context");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      principal: { name: "Jane Doe" },
      profile: "default",
    });
  });

  test("formats a ServiceAccount principal", async () => {
    await workspace.setupMockHttp(serviceAccountPrincipalMock);
    const result = await workspace.runCommand("altertable context");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Service account:");
    expect(result.stdout).toContain("ci-bot (ci-bot)");
  });
});
