import type { AboutSubject } from "./AboutData.tsx";

export type WidgetEvidence = Omit<AboutSubject, "id" | "title" | "description" | "visual"> & {
  id: string;
};
