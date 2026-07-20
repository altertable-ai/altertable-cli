import { describe, expect, test } from "bun:test";
import { ConfigurationError } from "@/lib/errors.ts";
import type { DoctorCheck, DoctorCheckContext } from "@/commands/doctor/lib/model.ts";
import { runDoctorChecks } from "@/commands/doctor/lib/runner.ts";

function context(offline = false): DoctorCheckContext {
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

    const report = await runDoctorChecks(checks, context());

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
      context(true),
    );

    expect(report.healthy).toBe(true);
    expect(report.summary.skipped).toBe(1);
    expect(report.checks[0]).toMatchObject({ status: "skipped", message: "Offline mode." });
  });

  test("rejects duplicate and forward dependency ids", async () => {
    const duplicate: DoctorCheck = {
      id: "same",
      label: "Same",
      run: () => ({ status: "pass", message: "Ready." }),
    };
    await expectRejection(
      runDoctorChecks([duplicate, duplicate], context()),
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
        context(),
      ),
      "requires unknown or later check",
    );
  });
});
