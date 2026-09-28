import type { AboutSubject } from "../inspect/AboutData.tsx";

export type CardEvidence = Omit<AboutSubject, "id" | "title" | "description" | "visual"> & {
  id: string;
};
