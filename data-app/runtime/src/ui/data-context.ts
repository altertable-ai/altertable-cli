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
