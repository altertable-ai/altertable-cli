import { serializeCliError } from "@/lib/errors.ts";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorReport,
  DoctorSummary,
} from "@/commands/doctor/lib/model.ts";

function summarizeCheckResults(checks: readonly DoctorCheckResult[]): DoctorSummary {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    failed: checks.filter((check) => check.status === "fail").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
  };
}

function validateCheckSequence(checks: readonly DoctorCheck[]): void {
  const precedingIds = new Set<string>();
  for (const check of checks) {
    if (precedingIds.has(check.id)) {
      throw new Error(`Duplicate doctor check id: ${check.id}`);
    }
    for (const dependencyId of check.requires ?? []) {
      if (!precedingIds.has(dependencyId)) {
        throw new Error(
          `Doctor check ${check.id} requires unknown or later check ${dependencyId}.`,
        );
      }
    }
    precedingIds.add(check.id);
  }
}

async function runDoctorCheck(
  check: DoctorCheck,
  context: DoctorCheckContext,
  dependencies: readonly DoctorCheckResult[],
): Promise<DoctorCheckResult> {
  const blocker = dependencies.find(
    (dependency) => dependency.status !== "pass" && dependency.status !== "warn",
  );
  if (blocker) {
    return {
      id: check.id,
      label: check.label,
      status: "skipped",
      message: `Blocked by ${blocker.label.toLowerCase()}.`,
    };
  }

  const skipReason = check.skip?.(context);
  if (skipReason) {
    return {
      id: check.id,
      label: check.label,
      status: "skipped",
      message: skipReason,
    };
  }

  const startedAt = performance.now();
  try {
    const outcome = await check.run(context);
    return {
      ...outcome,
      id: check.id,
      label: check.label,
      duration_ms: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    const serialized = serializeCliError(error);
    return {
      id: check.id,
      label: check.label,
      status: "fail",
      message: serialized.message,
      code: serialized.code,
      http_status: serialized.status,
      details: serialized.details,
      remediation: check.remediation?.(error, context),
      duration_ms: Math.round(performance.now() - startedAt),
    };
  }
}

export async function runDoctorChecks(
  checks: readonly DoctorCheck[],
  context: DoctorCheckContext,
): Promise<DoctorReport> {
  validateCheckSequence(checks);

  const pendingResults = new Map<string, Promise<DoctorCheckResult>>();
  for (const check of checks) {
    const dependencies = (check.requires ?? []).map((id) => pendingResults.get(id)!);
    pendingResults.set(
      check.id,
      Promise.all(dependencies).then((results) => runDoctorCheck(check, context, results)),
    );
  }

  const checkResults = await Promise.all(pendingResults.values());
  const summary = summarizeCheckResults(checkResults);
  return {
    healthy: summary.failed === 0,
    profile: context.execution.profile,
    summary,
    checks: checkResults,
  };
}
