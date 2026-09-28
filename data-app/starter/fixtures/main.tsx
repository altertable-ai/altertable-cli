import { mountDataApp } from "@altertable/data-app-runtime/react";
import { createDataHooks } from "@altertable/data-app-runtime/react";
import { createDataClient } from "@altertable/data-app-runtime/client";
import { connectionCheck } from "@altertable/data-app-runtime/contract";
import { DataApp, DataSection } from "@altertable/data-app-runtime/ui";

const { useDataView } = createDataHooks<{ connection: ReturnType<typeof connectionCheck> }>(
  createDataClient(),
);

const config = {
  title: "Orders exploration",
  scope: { organization: "Acme", environment: "production" },
  appearance: { mode: "light" },
};
const dataContext = {
  description: "A fixture exploring completed orders.",
  glossary: { orders: { term: "Orders", definition: "Completed customer orders." } },
};
const empty = { glossary: { title: "No terms for this view" }, queries: { title: "No SQL for this view" } };

function Fixture() {
  const connection = useDataView("connection", {}, {
    isEmpty: () => false,
    describeInput: () => "the connection check",
  });
  return (
    <DataApp
      config={config}
      dataContext={dataContext}
      aboutEmpty={empty}
      request={connection}
      story={{
        steps: [
          {
            id: "orders",
            empty,
            headline: "Orders increased",
            visual: <p>120 orders</p>,
            glossaryIds: ["orders"],
          },
          { id: "customers", headline: "More returning customers", visual: <p>80 customers</p>, glossaryIds: [], empty },
        ],
      }}
    >
      <DataSection result={connection}>
        {() => <p>Connection view ready</p>}
      </DataSection>
    </DataApp>
  );
}

mountDataApp({ config, component: Fixture });
