import type {
  DoctorCheckResult,
  DoctorCheckStatus,
  DoctorReport,
} from "@/commands/doctor/lib/model.ts";
import { span, type DisplayTextStyle } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

const STATUS_DISPLAY: Record<DoctorCheckStatus, { icon: string; style: DisplayTextStyle }> = {
  pass: { icon: "✓", style: "success" },
  warn: { icon: "!", style: "warning" },
  fail: { icon: "✗", style: "error" },
  skipped: { icon: "-", style: "muted" },
};

function formatCheck(check: DoctorCheckResult, labelWidth: number): string[] {
  const display = STATUS_DISPLAY[check.status];
  const lines = [
    renderDisplayText([
      span(display.icon, display.style),
      span(` ${check.label.padEnd(labelWidth)}  `, "strong"),
      span(check.message, check.status === "skipped" ? "muted" : undefined),
    ]),
  ];
  for (const remediation of check.remediation ?? []) {
    lines.push(renderDisplayText([span(`${" ".repeat(labelWidth + 4)}${remediation}`, "muted")]));
  }
  return lines;
}

function formatSummary(report: DoctorReport): string {
  const values = [
    `${report.summary.passed} passed`,
    report.summary.warnings > 0 ? `${report.summary.warnings} warned` : undefined,
    report.summary.failed > 0 ? `${report.summary.failed} failed` : undefined,
    report.summary.skipped > 0 ? `${report.summary.skipped} skipped` : undefined,
  ].filter((value): value is string => value !== undefined);
  const style: DisplayTextStyle = report.healthy ? "success" : "error";
  return renderDisplayText([
    span("Result: ", "strong"),
    span(report.healthy ? "healthy" : "unhealthy", style),
    span(` · ${values.join(", ")}`, "muted"),
  ]);
}

export function formatDoctorReport(report: DoctorReport): string {
  const labelWidth = Math.max(...report.checks.map((check) => check.label.length));
  return [
    renderDisplayText([span("Altertable CLI doctor", "heading")]),
    "",
    ...report.checks.flatMap((check) => formatCheck(check, labelWidth)),
    "",
    formatSummary(report),
  ].join("\n");
}
