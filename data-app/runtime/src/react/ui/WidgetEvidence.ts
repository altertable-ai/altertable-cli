export type WidgetEvidence = { id: string } & (
  | { glossaryIds: [string, ...string[]]; queryNames?: string[] }
  | { queryNames: [string, ...string[]]; glossaryIds?: string[] }
);
