import { mountDataApp } from "@altertable/data-app-runtime/react";
import { createDataHooks } from "@altertable/data-app-runtime/react";
import { createDataClient } from "@altertable/data-app-runtime/client";
import { connectionCheck } from "@altertable/data-app-runtime/contract";
import { DataApp, DataSection, Grid, Stack } from "@altertable/data-app-runtime/ui";

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
const empty = {
  glossary: { title: "No terms for this view" },
  queries: { title: "No SQL for this view" },
};

function Fixture() {
  const connection = useDataView(
    "connection",
    {},
    {
      isEmpty: () => false,
      describeInput: () => "the connection check",
    },
  );
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
          {
            id: "customers",
            headline: "More returning customers",
            visual: <p>80 customers</p>,
            glossaryIds: [],
            empty,
          },
        ],
      }}
    >
      <Stack data-testid="layout-stack">
        <Grid columns={2} data-testid="layout-grid">
          <div>Short panel</div>
          <div>
            <div style={{ height: 160 }}>Tall panel</div>
          </div>
        </Grid>
        <Grid columns={2} data-testid="constrained-grid" style={{ maxWidth: 480 }}>
          <div>First narrow card</div>
          <div>Second narrow card</div>
        </Grid>
        <DataSection result={connection}>{() => <p>Connection view ready</p>}</DataSection>
      </Stack>
    </DataApp>
  );
}

mountDataApp({ config, component: Fixture });
