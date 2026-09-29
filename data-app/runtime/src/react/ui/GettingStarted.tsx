import { createDataClient } from "../../client/index.ts";
import type { DataAppConfig } from "../../core/config.ts";
import { connectionCheck } from "../../core/contract.ts";
import { createDataHooks } from "../hooks.ts";
import { AppIcon } from "./icons.ts";
import { Button } from "./Button.tsx";
import { DataApp } from "./DataApp.tsx";
import type { DataContext } from "./data-context.ts";
import "./GettingStarted.css";

const { useDataQuery } = createDataHooks<{ connection: ReturnType<typeof connectionCheck> }>(
  createDataClient(),
);

/** Query-backed connection state and next steps for a newly created app. Mount within
 * `DataAppProvider` and register `connection: connectionCheck()` on the server. */
export function GettingStarted({
  config,
  dataContext,
}: {
  config: DataAppConfig;
  dataContext: DataContext;
}) {
  const connection = useDataQuery("connection", {});
  const state = connection.error
    ? "error"
    : connection.isFetching || !connection.data
      ? "checking"
      : "connected";

  return (
    <DataApp
      config={config}
      dataContext={dataContext}
      description="Check your lakehouse connection, then build a view around a real question."
      queries={connection.data?.queries}
      refresh={{
        refreshing: connection.isFetching,
        onRefresh: () => void connection.refetch(),
        tooltip: "Check connection",
        buttonProps: { "aria-label": "Check connection" },
      }}
    >
      <section
        className="starter-connection"
        data-state={state}
        role={state === "error" ? "alert" : "status"}
      >
        <div className="starter-connection-icon">
          <AppIcon
            name={state === "connected" ? "check" : state === "error" ? "error" : "loading"}
            size={24}
          />
        </div>
        <div className="starter-connection-copy">
          <span className="starter-eyebrow">Lakehouse connection</span>
          <h2>
            {state === "connected"
              ? "Connected"
              : state === "error"
                ? "Connection not verified"
                : "Checking connection…"}
          </h2>
          <p>
            {state === "connected"
              ? "A query completed successfully using this app’s current profile. You’re ready to build your first view."
              : state === "error"
                ? connection.data
                  ? "An earlier query succeeded, but the latest check failed. Check the profile and try again."
                  : "The query could not complete. Check the profile and lakehouse access, then try again."
                : "Running a lightweight query with this app’s current profile."}
          </p>
          {state === "connected" && (
            <small>This check does not verify access to every dataset.</small>
          )}
        </div>
        {state === "error" && <Button onClick={() => void connection.refetch()}>Try again</Button>}
      </section>

      <section className="starter-next" aria-labelledby="starter-next-title">
        <div className="starter-next-heading">
          <span className="starter-eyebrow">Next steps</span>
          <h2 id="starter-next-title">Turn this starter into a useful app</h2>
          <p>Start with one question your readers need answered.</p>
        </div>
        <ol className="starter-steps">
          <li>
            <strong>Choose a question</strong>
            <p>Decide what someone should learn or do after opening this app.</p>
          </li>
          <li>
            <strong>Find the right data</strong>
            <p>Inspect the relevant catalogs, tables, and columns before writing the query.</p>
          </li>
          <li>
            <strong>Build the first view</strong>
            <p>
              Replace the connection check in <code>src/operations.ts</code>, then render its result
              in <code>src/App.tsx</code>.
            </p>
          </li>
        </ol>
      </section>
    </DataApp>
  );
}
