import { defineQueryNames } from "../../core/contract.ts";
import { invariant } from "../../core/invariant.ts";
import type { ReactNode } from "react";
import type { DataIdentifierDefinition } from "./data-identifiers.tsx";
import type { MetricFormat } from "../../core/format.ts";
import type { MetricDefinition } from "./metric.ts";
import type { StoryFinding } from "./story.ts";
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
  queryNames?: Readonly<Record<string, string>>;
};

function evidenceFor<
  const Context extends DataContext,
  const Names extends Record<string, string> = Record<string, string>,
>(context: Context, names?: Names) {
  return (evidence: {
    id: string;
    glossaryIds?: readonly (keyof Context["glossary"] & string)[];
    queryNames?: readonly Names[keyof Names][];
  }) => {
    for (const id of evidence.glossaryIds ?? []) {
      invariant(context.glossary[id], `Unknown glossary entry: ${id}.`);
    }
    if (names)
      for (const name of evidence.queryNames ?? []) {
        invariant(Object.values(names).includes(name), `Unknown query name: ${name}.`);
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
        invariant(known.has(query), `Unknown query ${query} for glossary entry ${id}.`);
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
      invariant(!!input.id.trim(), "Evidence needs a nonempty ID.");
      invariant(
        !!input.glossaryIds?.length || !!input.queryNames?.length,
        `Evidence ${input.id} needs a glossary entry or query name.`,
      );
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
    function finding(
      input: Omit<StoryFinding, "evidence"> & {
        evidence: Parameters<typeof evidence>[0];
      },
    ): StoryFinding & { evidence: WidgetEvidence } {
      return { ...input, evidence: evidence(input.evidence) };
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
    return { ...context, queryNames, evidence, finding, metric };
  };
}
