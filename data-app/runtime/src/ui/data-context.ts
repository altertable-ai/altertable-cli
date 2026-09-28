import type { ReactNode } from "react";
import type { DataIdentifierDefinition } from "./data-identifiers.tsx";

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
