import { defineQueryNames } from "../../core/contract.ts";
import type { ReactNode } from "react";
import type { DataIdentifierDefinition } from "./data-identifiers.tsx";
import type { MetricFormat } from "../../core/format.ts";
import type { MetricDefinition } from "./metric.ts";
import type { SummaryPoint } from "./PlayStory.tsx";
import type { WidgetEvidence } from "./WidgetEvidence.ts";

export type GlossaryEntry = {
  term: string;
  definition: ReactNode;
  queryNames?: string[];
};

export type DataContext = {
  description: ReactNode;
  glossary: Record<string, GlossaryEntry>;
  identifiers?: Readonly<Record<string, DataIdentifierDefinition>>;
};

export function defineDataContext<const Context extends DataContext>(context: Context): Context {
  return context;
}

export function evidenceFor<
  const Context extends DataContext,
  const Names extends Record<string, string> = Record<string, string>,
>(context: Context, names?: Names) {
  return (evidence: {
    id: string;
    glossaryIds?: readonly (keyof Context["glossary"] & string)[];
    queryNames?: readonly Names[keyof Names][];
  }) => {
    for (const id of evidence.glossaryIds ?? []) {
      if (!context.glossary[id]) throw new Error(`Unknown glossary entry: ${id}.`);
    }
    if (names)
      for (const name of evidence.queryNames ?? []) {
        if (!Object.values(names).includes(name)) throw new Error(`Unknown query name: ${name}.`);
      }
    return {
      id: evidence.id,
      glossaryIds: evidence.glossaryIds ? [...evidence.glossaryIds] : undefined,
      queryNames: evidence.queryNames ? [...evidence.queryNames] : undefined,
    };
  };
}

/** Bind glossary query references and card evidence to the same registry. */
export function createDataContext<const Names extends Record<string, string>>(queryNames: Names) {
  defineQueryNames(queryNames);
  return <
    const Context extends Omit<DataContext, "glossary"> & {
      glossary: Record<
        string,
        Omit<GlossaryEntry, "queryNames"> & { queryNames?: Names[keyof Names][] }
      >;
    },
  >(
    context: Context,
  ) => {
    const known = new Set(Object.values(queryNames));
    for (const [id, entry] of Object.entries(context.glossary)) {
      for (const query of entry.queryNames ?? []) {
        if (!known.has(query)) throw new Error(`Unknown query ${query} for glossary entry ${id}.`);
      }
    }
    const references = evidenceFor(context, queryNames);
    type GlossaryId = keyof Context["glossary"] & string;
    type QueryName = Names[keyof Names];
    function evidence(
      input: { id: string } & (
        | { glossaryIds: readonly [GlossaryId, ...GlossaryId[]]; queryNames?: readonly QueryName[] }
        | { queryNames: readonly [QueryName, ...QueryName[]]; glossaryIds?: readonly GlossaryId[] }
      ),
    ): WidgetEvidence {
      if (!input.id.trim()) throw new Error("Evidence needs a nonempty ID.");
      if (!input.glossaryIds?.length && !input.queryNames?.length)
        throw new Error(`Evidence ${input.id} needs a glossary entry or query name.`);
      const validated = references(input);
      if (validated.glossaryIds?.length)
        return {
          ...validated,
          glossaryIds: [validated.glossaryIds[0]!, ...validated.glossaryIds.slice(1)],
        };
      return {
        ...validated,
        queryNames: [validated.queryNames![0]!, ...validated.queryNames!.slice(1)],
      };
    }
    function summaryPoint<
      const Step extends Omit<SummaryPoint, "glossaryIds" | "queryNames"> & {
        glossaryIds?: readonly (keyof Context["glossary"] & string)[];
        queryNames?: readonly Names[keyof Names][];
      },
    >(step: Step): SummaryPoint {
      const stepReferences = references({
        id: step.id,
        glossaryIds: step.glossaryIds,
        queryNames: step.queryNames,
      });
      return { ...step, ...stepReferences };
    }
    function metric(definition: {
      id: string;
      glossaryId: keyof Context["glossary"] & string;
      label?: string;
      format: MetricFormat;
      favorableDirection?: "up" | "down";
      queryNames?: readonly Names[keyof Names][];
    }): MetricDefinition {
      const references = evidence({
        id: definition.id,
        glossaryIds: [definition.glossaryId],
        queryNames: definition.queryNames ?? context.glossary[definition.glossaryId]?.queryNames,
      });
      return {
        id: definition.id,
        label: definition.label ?? context.glossary[definition.glossaryId]!.term,
        format: definition.format,
        favorableDirection: definition.favorableDirection,
        evidence: references,
      };
    }
    return { ...context, queryNames, evidence, summaryPoint, storyStep: summaryPoint, metric };
  };
}
