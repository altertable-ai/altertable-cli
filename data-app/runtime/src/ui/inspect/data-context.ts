/** A reader-facing definition used in the Glossary and local inspect sheets. */
export type GlossaryEntry = {
  term: string;
  definition: string;
  queryNames?: string[];
};

/** App-owned context for the exploration, shared by the page and Present mode. */
export type DataContext = {
  description: string;
  glossary: Record<string, GlossaryEntry>;
};
