import { describe, expect, test } from "bun:test";
import { ConfigurationError, HttpError } from "@/lib/errors.ts";
import type { DoctorCheck, DoctorCheckContext } from "@/commands/doctor/lib/model.ts";
import { runDoctorChecks } from "@/commands/doctor/lib/runner.ts";

function createDoctorContext(offline = false): DoctorCheckContext {
  return {
    offline,
    execution: {
      profile: "test",
      cli: { debug: false, json: true, agent: false },
      output: {
        json: true,
        debug: false,
        writeStderr() {},
        writeJson() {},
        writeRaw() {},
        writeHuman() {},
        writeMetadata() {},
      },
    },
  };
}

async function expectRejection(promise: Promise<unknown>, message: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(message);
}

describe("runDoctorChecks", () => {
  test("aggregates outcomes and isolates thrown check errors", async () => {
    const checks: DoctorCheck[] = [
      {
        id: "passing",
        label: "Passing",
        run: () => ({ status: "pass", message: "Ready." }),
      },
      {
        id: "failing",
        label: "Failing",
        run() {
          throw new ConfigurationError("Missing.");
        },
        remediation: () => ["Configure it."],
      },
      {
        id: "dependent",
        label: "Dependent",
        requires: ["failing"],
        run: () => ({ status: "pass", message: "Should not run." }),
      },
    ];

    const report = await runDoctorChecks(checks, createDoctorContext());

    expect(report.healthy).toBe(false);
    expect(report.summary).toEqual({ passed: 1, warnings: 0, failed: 1, skipped: 1 });
    expect(report.checks[1]).toMatchObject({
      id: "failing",
      status: "fail",
      code: "configuration_error",
      message: "Missing.",
      remediation: ["Configure it."],
    });
    expect(report.checks[2]).toMatchObject({
      status: "skipped",
      message: "Blocked by failing.",
    });
  });

  test("supports intentional skips without making the report unhealthy", async () => {
    const report = await runDoctorChecks(
      [
        {
          id: "network",
          label: "Network",
          skip: ({ offline }) => (offline ? "Offline mode." : undefined),
          run: () => ({ status: "pass", message: "Connected." }),
        },
      ],
      createDoctorContext(true),
    );

    expect(report.healthy).toBe(true);
    expect(report.summary.skipped).toBe(1);
    expect(report.checks[0]).toMatchObject({ status: "skipped", message: "Offline mode." });
  });

  test("runs independent checks concurrently and preserves report order", async () => {
    const started: string[] = [];
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const secondFinished = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });

    const reportPromise = runDoctorChecks(
      [
        {
          id: "first",
          label: "First",
          async run() {
            started.push("first");
            await firstFinished;
            return { status: "pass", message: "First done." };
          },
        },
        {
          id: "second",
          label: "Second",
          async run() {
            started.push("second");
            await secondFinished;
            return { status: "pass", message: "Second done." };
          },
        },
        {
          id: "dependent",
          label: "Dependent",
          requires: ["first", "second"],
          run() {
            started.push("dependent");
            return { status: "pass", message: "Dependent done." };
          },
        },
      ],
      createDoctorContext(),
    );

    await Promise.resolve();
    expect(started).toEqual(["first", "second"]);

    finishSecond();
    await Promise.resolve();
    expect(started).toEqual(["first", "second"]);

    finishFirst();
    const report = await reportPromise;

    expect(started).toEqual(["first", "second", "dependent"]);
    expect(report.checks.map((check) => check.id)).toEqual(["first", "second", "dependent"]);
  });

  test("preserves HTTP status and CLI error details", async () => {
    const report = await runDoctorChecks(
      [
        {
          id: "http",
          label: "HTTP",
          run() {
            throw new HttpError({
              status: 401,
              body: '{"message":"Token expired"}',
              method: "GET",
              url: "https://example.com/whoami",
              parsedDetail: "Token expired",
              authPlane: "management",
            });
          },
        },
        {
          id: "config",
          label: "Config",
          run() {
            throw new ConfigurationError("Invalid configuration.", {
              details: "The profile file is unreadable.",
            });
          },
        },
      ],
      createDoctorContext(),
    );

    expect(report.checks[0]).toMatchObject({
      status: "fail",
      code: "auth_failed",
      http_status: 401,
      details: "Token expired",
    });
    expect(report.checks[1]).toMatchObject({
      status: "fail",
      code: "configuration_error",
      details: "The profile file is unreadable.",
    });
  });

  test("rejects duplicate and forward dependency ids", async () => {
    const duplicate: DoctorCheck = {
      id: "same",
      label: "Same",
      run: () => ({ status: "pass", message: "Ready." }),
    };
    await expectRejection(
      runDoctorChecks([duplicate, duplicate], createDoctorContext()),
      "Duplicate doctor check id",
    );
    await expectRejection(
      runDoctorChecks(
        [
          {
            id: "first",
            label: "First",
            requires: ["later"],
            run: () => ({ status: "pass", message: "Ready." }),
          },
          { ...duplicate, id: "later" },
        ],
        createDoctorContext(),
      ),
      "requires unknown or later check",
    );
  });
});
