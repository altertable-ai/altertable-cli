import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { jsonMock, whoamiMock } from "./mock-http.ts";

const queryMock = [jsonMock("POST", "/query", {})];

describe("altertable profile configure", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_LAKEHOUSE_USERNAME: undefined,
      ALTERTABLE_LAKEHOUSE_PASSWORD: undefined,
      ALTERTABLE_BASIC_AUTH_TOKEN: undefined,
      ALTERTABLE_API_BASE: undefined,
    });
  });

  test("stores lakehouse, basic-token, and management credentials", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u_blabla --password s_llll")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.defaultProfileConfig)).toContain("user=u_blabla\n");
    expect(await workspace.readFile(workspace.credentialsFile)).toContain("profile/default/lakehouse/password=s_llll\n");
    expect(await workspace.fileMode(workspace.credentialsFile)).toBe("600");

    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --basic-token dG9rZW4=")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.credentialsFile)).toContain("profile/default/lakehouse/basic-token=dG9rZW4=\n");

    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --api-key atm_prod --env production")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.credentialsFile)).toContain("profile/default/api-key=atm_prod\n");
    expect(await workspace.readFile(workspace.defaultProfileConfig)).toContain("api_key_env=production\n");
  });

  test("accumulates separate mechanisms and overrides the same mechanism", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u1 --password p1")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable profile configure --api-key atm_x --env prod")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.defaultProfileConfig)).toContain("user=u1\n");
    expect(await workspace.readFile(workspace.credentialsFile)).toContain("profile/default/lakehouse/password=p1\n");
    expect(await workspace.readFile(workspace.credentialsFile)).toContain("profile/default/api-key=atm_x\n");

    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --api-key atm_x --env prod")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable profile configure --api-key atm_y --env staging")).exitCode).toBe(0);
    const credentials = await workspace.readFile(workspace.credentialsFile);
    expect(credentials).not.toContain("atm_x");
    expect(credentials).toContain("profile/default/api-key=atm_y\n");
    expect(await workspace.readFile(workspace.defaultProfileConfig)).toContain("api_key_env=staging\n");
  });

  test("validates mutually exclusive and incomplete credential flags", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u --password p --api-key k --env e")).exitCode).not.toBe(0);
    expect((await workspace.runCommand("altertable profile configure --user u --password p --env prod")).exitCode).not.toBe(0);
    expect((await workspace.runCommand("altertable profile configure --api-key k")).exitCode).not.toBe(0);
    expect((await workspace.runCommand("altertable profile configure --user u")).exitCode).not.toBe(0);
  });

  test("reads stdin secrets", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user alice --password-stdin", { stdin: "s_fromstdin" })).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.credentialsFile)).toContain("profile/default/lakehouse/password=s_fromstdin\n");

    expect((await workspace.runCommand("altertable profile configure --api-key-stdin --env prod", { stdin: "atm_fromstdin" })).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.credentialsFile)).toContain("profile/default/api-key=atm_fromstdin\n");
  });

  test("profile show reports auth without leaking secrets, and non-TTY configure requires flags", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u_blabla --password s_llll")).exitCode).toBe(0);
    const result = await workspace.runCommand("altertable profile show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Lakehouse auth");
    expect(result.stdout).toContain("username_password");
    expect(result.stdout).not.toContain("s_llll");

    await workspace.resetConfig();
    const configure = await workspace.runCommand("altertable profile configure");
    expect(configure.exitCode).not.toBe(0);
    expect(configure.stderr).toContain("Interactive configure requires a TTY");
  });

  test("profile status checks management credentials after save", async () => {
    await workspace.resetConfig();
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(whoamiMock());

    const configured = await workspace.runCommand(
      "altertable profile configure --api-key atm_x --env prod --control-plane-url http://localhost:13000",
    );
    const result = await workspace.runCommand("altertable profile status");

    expect(configured.exitCode).toBe(0);
    expect(result.exitCode).toBe(0);
  });

  test("stored and environment credentials drive lakehouse authentication without leaking secrets", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user alice --password secret")).exitCode).toBe(0);
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(queryMock);
    expect((await workspace.runCommand('altertable query "SELECT 1"')).exitCode).toBe(0);
    let log = await workspace.readHttpLog();
    expect(log).toContain("AUTH=Authorization: [REDACTED]");
    expect(log).not.toContain("secret");
    expect(log).not.toContain(Buffer.from("alice:secret").toString("base64"));

    await workspace.setupHttpLog();
    await workspace.setupMockHttp(queryMock);
    expect(
      (
        await workspace.runCommand('altertable query "SELECT 1"', {
          env: { ALTERTABLE_LAKEHOUSE_USERNAME: "envuser", ALTERTABLE_LAKEHOUSE_PASSWORD: "envpass" },
        })
      ).exitCode,
    ).toBe(0);
    log = await workspace.readHttpLog();
    expect(log).toContain("AUTH=Authorization: [REDACTED]");
    expect(log).not.toContain("secret");
    expect(log).not.toContain(Buffer.from("envuser:envpass").toString("base64"));
  });

  test("refuses credentials files looser than 600", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u --password p")).exitCode).toBe(0);
    await workspace.chmodFile(workspace.credentialsFile, 0o644);

    let result = await workspace.runCommand("altertable profile show");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("too open");

    await workspace.setupMockHttp(queryMock);
    result = await workspace.runCommand('altertable query "SELECT 1"');
    expect(result.exitCode).not.toBe(0);

    await workspace.chmodFile(workspace.credentialsFile, 0o600);
    expect((await workspace.runCommand("altertable profile show")).exitCode).toBe(0);
  });

  test("--clear removes all stored configuration", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u --password p")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable logout")).exitCode).toBe(0);

    expect(await workspace.fileExists(workspace.configFile)).toBe(false);
    expect(await workspace.fileExists(workspace.credentialsFile)).toBe(false);
    const show = await workspace.runCommand("altertable profile show");
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toContain("empty");
  });

  test("stores endpoint overrides and applies endpoint precedence", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --api-key atm_x --env prod --control-plane-url http://localhost:13000")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.defaultProfileConfig)).toContain("management_api_base=http://localhost:13000\n");

    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u --password p --data-plane-url http://localhost:15000")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.defaultProfileConfig)).toContain("api_base=http://localhost:15000\n");

    await workspace.resetConfig();
    let result = await workspace.runCommand("altertable profile configure --control-plane-url http://localhost:13000");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--control-plane-url must be set together with a credential.");

    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --data-plane-url http://localhost:15000")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.defaultProfileConfig)).toContain("api_base=http://localhost:15000\n");

    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u --password p --data-plane-url http://127.0.0.1:1111")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable profile configure --user u --password p")).exitCode).toBe(0);
    expect(await workspace.readFile(workspace.defaultProfileConfig)).not.toContain("api_base=");
  });

  test("stored control-plane and data-plane roots resolve at request time", async () => {
    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --api-key atm_x --env prod --control-plane-url http://localhost:13000")).exitCode).toBe(0);
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(whoamiMock());
    expect((await workspace.runCommand("altertable api /whoami")).exitCode).toBe(0);
    expect(await workspace.httpLogValue("URL")).toBe("http://localhost:13000/rest/v1/whoami");

    await workspace.resetConfig();
    expect((await workspace.runCommand("altertable profile configure --user u --password p --data-plane-url http://127.0.0.1:1111")).exitCode).toBe(0);
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(queryMock);
    // An env data-plane URL isolates to `_from_env`, so credentials must also come
    // from the environment; the stored data-plane root is not consulted.
    expect(
      (
        await workspace.runCommand('altertable query "SELECT 1"', {
          env: {
            ALTERTABLE_API_BASE: "http://127.0.0.1:2222",
            ALTERTABLE_LAKEHOUSE_USERNAME: "u",
            ALTERTABLE_LAKEHOUSE_PASSWORD: "p",
          },
        })
      ).exitCode,
    ).toBe(0);
    expect(await workspace.httpLogValue("URL")).toBe("http://127.0.0.1:2222/query");

    await workspace.setupHttpLog();
    await workspace.setupMockHttp(queryMock);
    expect((await workspace.runCommand('altertable query "SELECT 1"')).exitCode).toBe(0);
    expect(await workspace.httpLogValue("URL")).toBe("http://127.0.0.1:1111/query");
  });

  test("--show displays both data and control planes", async () => {
    await workspace.resetConfig();
    expect(
      (
        await workspace.runCommand(
          "altertable profile configure --user u --password p --data-plane-url http://localhost:15000 --control-plane-url http://localhost:13000",
        )
      ).exitCode,
    ).toBe(0);

    const result = await workspace.runCommand("altertable profile show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Data plane");
    expect(result.stdout).toContain("Control plane");
    expect(result.stdout).toContain("http://localhost:15000");
    expect(result.stdout).toContain("http://localhost:13000");
  });
});
