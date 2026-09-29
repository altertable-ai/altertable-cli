import { defineQueryNames } from "../contract.ts";
import type { ReactNode } from "react";
import type { DataIdentifierDefinition } from "./data-identifiers.tsx";
import type { StoryStep } from "./PlayStory.tsx";

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
    const evidence = evidenceFor(context, queryNames);
    function storyStep<
      const Step extends Omit<StoryStep, "glossaryIds" | "queryNames"> & {
        glossaryIds?: readonly (keyof Context["glossary"] & string)[];
        queryNames?: readonly Names[keyof Names][];
      },
    >(step: Step): StoryStep {
      const references = evidence({
        id: step.id,
        glossaryIds: step.glossaryIds,
        queryNames: step.queryNames,
      });
      return { ...step, ...references };
    }
    return { ...context, queryNames, evidence, storyStep };
  };
}
