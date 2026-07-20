import type { ExecutionContext } from "@/lib/execution-context.ts";

export type DoctorCheckStatus = "pass" | "warn" | "fail" | "skipped";

export type DoctorCheckResult = {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  message: string;
  code?: string;
  http_status?: number;
  details?: string | Record<string, unknown>;
  remediation?: string[];
  duration_ms?: number;
};

export type DoctorSummary = {
  passed: number;
  warnings: number;
  failed: number;
  skipped: number;
};

export type DoctorReport = {
  healthy: boolean;
  profile: string;
  summary: DoctorSummary;
  checks: DoctorCheckResult[];
};

export type DoctorCheckContext = {
  execution: ExecutionContext;
  offline: boolean;
};

export type DoctorCheckOutcome = Omit<DoctorCheckResult, "id" | "label">;

export type DoctorCheck = {
  id: string;
  label: string;
  requires?: readonly string[];
  skip?: (context: DoctorCheckContext) => string | undefined;
  run: (context: DoctorCheckContext) => DoctorCheckOutcome | Promise<DoctorCheckOutcome>;
  remediation?: (error: unknown, context: DoctorCheckContext) => string[];
};
