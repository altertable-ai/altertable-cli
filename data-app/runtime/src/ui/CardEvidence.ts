import type { AboutSubject } from "./AboutData.tsx";

export type CardEvidence = Omit<AboutSubject, "id" | "title" | "description" | "visual"> & {
  id: string;
};
