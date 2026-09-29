import { GettingStarted } from "@altertable/data-app-runtime/ui";
import { dataContext } from "#app/data-context.ts";
import app from "#config";

/** Replace the setup screen with the first useful view once its query is ready. */
export function App() {
  return <GettingStarted config={app} dataContext={dataContext} />;
}
