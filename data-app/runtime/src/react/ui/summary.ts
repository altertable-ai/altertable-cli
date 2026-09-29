import type { ReactNode } from "react";
import type { DisplayedSnapshot } from "../../core/data-view.ts";
import type { MetricDefinition } from "./metric.ts";
import type { SummaryPoint } from "./PlayStory.tsx";
import type { WidgetEvidence } from "./WidgetEvidence.ts";
import type { DataContext } from "./data-context.ts";

/** One consequential, inspectable finding from the displayed result. */
export type SummaryFinding = {
  id: string;
  headline: string;
  context?: string;
  visual: ReactNode;
  visualKind?: "metric" | "chart";
  evidence: WidgetEvidence | MetricDefinition;
};

export type BoundSummary<Data, Input> = (
  snapshot: DisplayedSnapshot<Data, Input>,
) => readonly SummaryFinding[];

/** Validate the authored findings before handing them to the presentation UI. */
export function summaryPoints(
  findings: readonly SummaryFinding[],
  context: DataContext,
): SummaryPoint[] {
  if (!findings.length || findings.length > 4)
    throw new Error("Present needs one to four summary findings.");
  const ids = new Set<string>();
  return findings.map((finding) => {
    if (!finding.id.trim() || ids.has(finding.id))
      throw new Error(`Summary finding IDs must be nonempty and unique: ${finding.id}.`);
    if (!finding.headline.trim())
      throw new Error(`Summary finding ${finding.id} needs a headline.`);
    ids.add(finding.id);
    const evidence = "evidence" in finding.evidence ? finding.evidence.evidence : finding.evidence;
    if (!evidence.glossaryIds?.length && !evidence.queryNames?.length)
      throw new Error(`Summary finding ${finding.id} needs source evidence.`);
    for (const id of evidence.glossaryIds ?? [])
      if (!context.glossary[id]) throw new Error(`Unknown glossary entry: ${id}.`);
    const names = context.queryNames && new Set(Object.values(context.queryNames));
    for (const name of evidence.queryNames ?? [])
      if (names && !names.has(name)) throw new Error(`Unknown query name: ${name}.`);
    return {
      id: finding.id,
      headline: finding.headline,
      context: finding.context,
      visual: finding.visual,
      visualKind: finding.visualKind,
      glossaryIds: evidence.glossaryIds,
      queryNames: evidence.queryNames,
    };
  });
}
