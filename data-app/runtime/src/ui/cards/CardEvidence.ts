import type { AboutSubject } from "../inspect/AboutData.tsx";

/** Stable inspect destination shared by metrics, visuals, tables, and story claims. */
export type CardEvidence = Omit<AboutSubject, "id" | "title" | "description" | "visual"> & {
  id: string;
};
