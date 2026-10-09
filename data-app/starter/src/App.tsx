import { GettingStarted } from "@altertable/data-app/react/ui";
import { dataContext } from "#app/data-context.ts";

/** Connectivity-only screen. Investigate the requested question, then replace this with a view
 * that leads with a supported finding and explores the useful angles behind it. */
export function App() {
  return <GettingStarted dataContext={dataContext} />;
}
