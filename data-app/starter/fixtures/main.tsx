import { injectDataAppStyles, mountDataApp } from "@altertable/data-app/react";
import { useState } from "react";
import { createDataHooks } from "@altertable/data-app/react";
import { createDataClient } from "@altertable/data-app/client";
import {
  connectionCheck,
  connectionQueryNames,
  defineDateRangeContract,
} from "@altertable/data-app/contract";
import {
  DataApp,
  dateRangeVariable,
  defineDataIdentifiers,
  ContentSkeleton,
  Grid,
  GridItem,
  GlossaryDefinition,
  MetricWidget,
  Stack,
  DataWidget,
  TableWidget,
  VisualizationWidget,
} from "@altertable/data-app/react";

const { defineDataView, useView } = createDataHooks<{
  connection: ReturnType<typeof connectionCheck>;
}>(createDataClient());

const config = {
  title: "Orders exploration",
  scope: { organization: "Acme", environment: "production" },
  appearance: { theme: "light" as const },
};
const identifiers = defineDataIdentifiers({
  tables: {
    orders: { catalog: "commerce", schema: "sales", name: "orders" },
  },
  columns: {
    customerId: { table: "orders", name: "customer_id" },
  },
});
const { DataIdentifier } = identifiers;
const dataContext = {
  queryNames: connectionQueryNames,
  identifiers: identifiers.definitions,
  description: (
    <>
      A fixture exploring completed orders in <DataIdentifier id="tables.orders" />.
    </>
  ),
  glossary: {
    orders: {
      term: "Orders",
      definition: (
        <>
          Completed orders grouped by <DataIdentifier id="columns.orders.customerId" />.
        </>
      ),
    },
  },
};
const empty = {
  glossary: { title: "No terms for this view" },
  queries: { title: "No SQL for this view" },
};
const periodVariable = dateRangeVariable({
  key: "period",
  comparison: true,
  contract: defineDateRangeContract({
    minDate: "2026-08-01",
    maxDate: "2026-09-30",
    maxRangeDays: 60,
    timeZone: "UTC",
  }),
  defaultValue: { kind: "dates", start: "2026-09-10", end: "2026-09-12" },
});

const connectionView = defineDataView({
  operation: "connection",
  variables: { period: periodVariable },
  input: () => ({}),
  isEmpty: () => false,
  describeInput: () => "connection check",
  empty: { title: "No orders in this period" },
});

function Fixture() {
  const connection = useView(connectionView);
  const [orderSearch, setOrderSearch] = useState("");
  return (
    <DataApp
      config={config}
      description="Completed orders in production."
      dataContext={dataContext}
      aboutEmpty={empty}
      request={connection}
      loading={
        <Grid columns={3} minItemWidth="compact" data-testid="loading-skeleton-grid">
          <GridItem span={2}>
            <ContentSkeleton variant="ranking" />
          </GridItem>
          <GridItem>
            <ContentSkeleton variant="ranking" />
          </GridItem>
        </Grid>
      }
      csvExport={() => ({
        filename: "orders.csv",
        tables: [{ name: "Orders", columns: ["Orders", "Customers"], rows: [[120, 80]] }],
      })}
      story={() => [
        {
          id: "orders",
          headline: "Orders increased",
          visual: <p>120 orders</p>,
          evidence: { id: "orders", glossaryIds: ["orders"] },
        },
        {
          id: "customers",
          headline: "More returning customers",
          visual: <p>80 customers</p>,
          evidence: { id: "customers", queryNames: [connectionQueryNames.connection] },
        },
      ]}
    >
      {() => (
        <Stack data-testid="layout-stack">
          <p>
            Review{" "}
            <GlossaryDefinition entry={dataContext.glossary.orders}>
              completed orders
            </GlossaryDefinition>
            .
          </p>
          <Grid columns={3} minItemWidth="compact" data-testid="peer-grid">
            <MetricWidget label="Actions" value={120} format={{ kind: "count" }} />
            <MetricWidget label="Identities" value={40} format={{ kind: "count" }} />
            <MetricWidget label="Organizations" value={26} format={{ kind: "count" }} />
          </Grid>
          <Grid columns={3} minItemWidth="compact" data-testid="spanned-grid">
            <GridItem span={2} data-testid="primary-grid-item">
              <VisualizationWidget title="Primary view" visual={<p>Product activity</p>} />
            </GridItem>
            <VisualizationWidget
              data-testid="support-grid-item"
              title="Supporting view"
              visual={<p>Feature reach</p>}
            />
          </Grid>
          <DataWidget title="Order activity" data-testid="layout-story">
            <Stack>
              <div data-testid="story-lead">
                <MetricWidget
                  label="Completed orders"
                  value={120}
                  format={{ kind: "count" }}
                  evidence={{ id: "orders", glossaryIds: ["orders"] }}
                />
              </div>
              <Grid columns={3} minItemWidth="compact">
                <GridItem span={2} data-testid="story-visual">
                  <VisualizationWidget title="Orders over time" visual={<p>Daily orders</p>} />
                </GridItem>
                <VisualizationWidget
                  title="Returning customers"
                  data-testid="story-support"
                  visual={<p>80 customers</p>}
                />
              </Grid>
            </Stack>
          </DataWidget>
          <Grid columns={2} data-testid="layout-grid">
            <div>Short panel</div>
            <div>
              <div style={{ height: 160 }}>Tall panel</div>
            </div>
          </Grid>
          <Grid columns={2} data-testid="constrained-grid" style={{ maxWidth: 480 }}>
            <div>First narrow widget</div>
            <div>Second narrow widget</div>
          </Grid>
          <TableWidget
            title="Paginated orders"
            rows={Array.from({ length: 11 }, (_, index) => ({
              id: index + 1,
              name: `Order ${index + 1}`,
            }))}
            rowKey={(row) => row.id}
            columns={[{ id: "order", header: "Order", cell: (row) => row.name }]}
            search={{
              label: "Search orders",
              value: orderSearch,
              onChange: setOrderSearch,
              attributes: [{ name: "order", getter: (row) => row.name }],
            }}
            pagination={{ pageSize: 4 }}
            empty={{ title: "No orders" }}
          />
          <p>Connection view ready</p>
        </Stack>
      )}
    </DataApp>
  );
}

injectDataAppStyles();
mountDataApp({ config, component: Fixture });
