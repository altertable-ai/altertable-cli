import { serializeCliError } from "@/lib/errors.ts";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorReport,
  DoctorSummary,
} from "@/commands/doctor/lib/model.ts";

function summarize(checks: readonly DoctorCheckResult[]): DoctorSummary {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    failed: checks.filter((check) => check.status === "fail").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
  };
}

function blockedBy(
  check: DoctorCheck,
  results: ReadonlyMap<string, DoctorCheckResult>,
): DoctorCheckResult | undefined {
  for (const dependencyId of check.requires ?? []) {
    const dependency = results.get(dependencyId);
    if (!dependency) {
      throw new Error(`Doctor check ${check.id} requires unknown or later check ${dependencyId}.`);
    }
    if (dependency.status !== "pass" && dependency.status !== "warn") {
      return dependency;
    }
  }
  return undefined;
}

export async function runDoctorChecks(
  checks: readonly DoctorCheck[],
  context: DoctorCheckContext,
): Promise<DoctorReport> {
  const results = new Map<string, DoctorCheckResult>();

  for (const check of checks) {
    if (results.has(check.id)) {
      throw new Error(`Duplicate doctor check id: ${check.id}`);
    }

    const dependency = blockedBy(check, results);
    if (dependency) {
      results.set(check.id, {
        id: check.id,
        label: check.label,
        status: "skipped",
        message: `Blocked by ${dependency.label.toLowerCase()}.`,
      });
      continue;
    }

    const skipReason = check.skip?.(context);
    if (skipReason) {
      results.set(check.id, {
        id: check.id,
        label: check.label,
        status: "skipped",
        message: skipReason,
      });
      continue;
    }

    const startedAt = performance.now();
    try {
      const outcome = await check.run(context);
      results.set(check.id, {
        ...outcome,
        id: check.id,
        label: check.label,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      const serialized = serializeCliError(error);
      results.set(check.id, {
        id: check.id,
        label: check.label,
        status: "fail",
        message: serialized.message,
        code: serialized.code,
        http_status: serialized.status,
        details: serialized.details,
        remediation: check.remediation?.(error, context),
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
  }

  const checkResults = [...results.values()];
  const summary = summarize(checkResults);
  return {
    healthy: summary.failed === 0,
    profile: context.execution.profile,
    summary,
    checks: checkResults,
  };
}
