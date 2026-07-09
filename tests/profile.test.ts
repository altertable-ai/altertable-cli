import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

const whoamiStaging = [
  {
    urlPattern: "/whoami",
    method: "GET",
    body: JSON.stringify({
      principal: { type: "User", name: "Staging", email: "s@x.io" },
      organization: { name: "Acme", slug: "acme" },
    }),
  },
];

const whoamiProduction = [
  {
    urlPattern: "/whoami",
    method: "GET",
    body: JSON.stringify({
      principal: { type: "User", name: "Production", email: "p@x.io" },
      organization: { name: "Acme", slug: "acme" },
    }),
  },
];

describe("profile switching", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({ ALTERTABLE_API_KEY: undefined, ALTERTABLE_ENV: undefined });
    expect((await workspace.runCommand("altertable profile create acme_staging --org acme --env staging")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable configure --profile acme_staging --api-key atm_staging --env staging")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable profile create acme_production --org acme --env production")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable configure --profile acme_production --api-key atm_prod --env production")).exitCode).toBe(0);
  });

  afterAll(async () => {
    await workspace.cleanup();
  });

  test("profile list shows configured org/env profiles", async () => {
    const result = await workspace.runCommand("altertable profile list");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("acme_staging");
    expect(result.stdout).toContain("acme_production");
    expect(result.stdout).toContain("acme");
  });

  test("profile switch and current update active profile", async () => {
    expect((await workspace.runCommand("altertable profile switch acme_staging")).exitCode).toBe(0);
    const result = await workspace.runCommand("altertable profile current");

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("acme_staging");
  });

  test("active profile and --profile flag select different identities", async () => {
    await workspace.setupMockHttp(whoamiStaging);
    let result = await workspace.runCommand("altertable context");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Staging");

    await workspace.setupMockHttp(whoamiProduction);
    result = await workspace.runCommand("altertable --profile acme_production context");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Production");
  });

  test("rename carries the active profile", async () => {
    expect((await workspace.runCommand("altertable profile rename acme_staging acme_stage")).exitCode).toBe(0);
    const result = await workspace.runCommand("altertable profile current");

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("acme_stage");
  });

  test("profile create, status, update, and env cover metadata workflows", async () => {
    expect((await workspace.runCommand('altertable profile create globex_dev --org globex --env dev --description "Globex dev"')).exitCode).toBe(0);
    let result = await workspace.runCommand("altertable profile status --name globex_dev");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Globex dev");
    expect(result.stdout).toContain("partial");

    expect((await workspace.runCommand('altertable profile create --org initech --env qa --description "Initech QA"')).exitCode).toBe(0);
    result = await workspace.runCommand("altertable profile status --name initech_qa");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Initech QA");

    expect((await workspace.runCommand('altertable profile update globex_dev --description "Globex development"')).exitCode).toBe(0);
    result = await workspace.runCommand("altertable profile status --name globex_dev");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Globex development");

    result = await workspace.runCommand("altertable profile env globex_dev");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('export ALTERTABLE_PROFILE="globex_dev"');
  });
});
