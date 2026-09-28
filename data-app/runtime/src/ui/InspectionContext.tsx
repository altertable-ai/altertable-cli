import { createContext, useContext } from "react";
import type { DisclosedQuery } from "../contract.ts";
import type { AboutEmpty } from "./AboutData.tsx";
import type { DataContext } from "./data-context.ts";

export type InspectionDefaults = {
  dataContext: DataContext;
  empty: AboutEmpty;
  queries?: DisclosedQuery[];
};

export const InspectionContext = createContext<InspectionDefaults | null>(null);

export function useInspectionDefaults(): InspectionDefaults | null {
  return useContext(InspectionContext);
}
