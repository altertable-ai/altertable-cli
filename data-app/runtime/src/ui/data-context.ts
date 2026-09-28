export type GlossaryEntry = {
  term: string;
  definition: string;
  queryNames?: string[];
};

export type DataContext = {
  description: string;
  glossary: Record<string, GlossaryEntry>;
};
