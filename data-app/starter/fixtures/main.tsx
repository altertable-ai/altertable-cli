import { defineDataApp } from "@altertable/data-app";
import { createDataClient } from "@altertable/data-app/client";
import { connectionCheck, defineDateRangeContract } from "@altertable/data-app/contract";
import {
  createDataContext,
  createDataHooks,
  DataApp,
  DataSection,
  dateRangeVariable,
  defineDataIdentifiers,
  Grid,
  GridItem,
  injectDataAppStyles,
  MetricWidget,
  mountDataApp,
  Skeleton,
  Stack,
  TableWidget,
  VisualizationWidget,
} from "@altertable/data-app/react";
import {
  DataWidget,
  GlossaryDefinition,
  MetricWidget as StaticMetricWidget,
  VisualizationWidget as StaticVisualizationWidget,
} from "@altertable/data-app/react/ui";
import type { DataReading } from "@altertable/data-app/react/ui";
import { useState } from "react";

const app = defineDataApp({
  title: "Orders exploration",
  description: "Completed orders in production.",
  scope: { organization: "Acme", environment: "production" },
  appearance: { theme: "light" },
  queries: { connection: { statement: "SELECT 1 AS connection_check", params: {} } },
});
const operations = { connection: connectionCheck(app.queries) };
const connectionQueryNames = operations.connection.queryNames;
const { defineDataView } = createDataHooks(createDataClient<typeof operations>());
const identifiers = defineDataIdentifiers({
  tables: {
    orders: { catalog: "commerce", schema: "sales", name: "orders" },
  },
  columns: {
    customerId: { table: "orders", name: "customer_id" },
  },
});
const { DataIdentifier } = identifiers;
const dataContext = createDataContext(connectionQueryNames)({
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
      queryNames: [connectionQueryNames.connection],
    },
  },
});
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
  dataContext,
  operation: "connection",
  variables: { period: periodVariable },
  input: () => ({}),
  isEmpty: () => false,
  describeInput: () => "connection check",
  emptyFallback: { title: "No orders in this period" },
});
const orders = Array.from({ length: 11 }, (_, index) => ({
  id: index + 1,
  name: `Order ${index + 1}`,
}));
const orderDataset = connectionView.dataset({
  name: "Orders",
  select: () => orders,
  rowKey: (order) => order.id,
  columns: { order: { label: "Order", value: (order) => order.name } },
  evidence: { id: "orders", glossaryIds: ["orders"] },
});
const completedOrders = connectionView.metric(
  {
    id: "completed-orders",
    glossaryId: "orders",
    label: "Completed orders",
    format: { kind: "count" },
  },
  () => ({ current: 120 }),
);
type ConnectionSource = {
  loading: false;
  data: true;
  input: Record<string, never>;
  scope: DataReading<string>;
};
const content = connectionView.content((source) => {
  if (source.loading)
    return (
      <output aria-label="Loading orders" style={{ display: "block" }}>
        <Grid columns={3} minItemWidth="compact" data-testid="loading-skeleton-grid">
          <GridItem span={2}>
            <div className="fixture-loading-content">
              <Skeleton style={{ display: "block", height: 16 }} />
              <Skeleton style={{ display: "block", height: 16 }} />
              <Skeleton style={{ display: "block", height: 16 }} />
              <Skeleton style={{ display: "block", height: 16 }} />
            </div>
          </GridItem>
          <GridItem>
            <div className="fixture-loading-content">
              <Skeleton style={{ display: "block", height: 16 }} />
              <Skeleton style={{ display: "block", height: 16 }} />
              <Skeleton style={{ display: "block", height: 16 }} />
              <Skeleton style={{ display: "block", height: 16 }} />
            </div>
          </GridItem>
        </Grid>
      </output>
    );
  return <FixtureContent source={source} />;
});

function FixtureContent({ source }: { source: ConnectionSource }) {
  const [orderSearch, setOrderSearch] = useState("");
  return (
    <Stack data-testid="layout-stack">
      <p>
        Review{" "}
        <GlossaryDefinition entry={dataContext.glossary.orders}>
          completed orders
        </GlossaryDefinition>
        .
      </p>
      <Grid columns={3} minItemWidth="compact" data-testid="peer-grid">
        <StaticMetricWidget label="Actions" value={120} format={{ kind: "count" }} />
        <StaticMetricWidget label="Identities" value={40} format={{ kind: "count" }} />
        <StaticMetricWidget label="Organizations" value={26} format={{ kind: "count" }} />
      </Grid>
      <Grid columns={3} minItemWidth="compact" data-testid="spanned-grid">
        <GridItem span={2} data-testid="primary-grid-item">
          <StaticVisualizationWidget title="Primary view" visual={<p>Product activity</p>} />
        </GridItem>
        <StaticVisualizationWidget
          data-testid="support-grid-item"
          title="Supporting view"
          visual={<p>Feature reach</p>}
        />
      </Grid>
      <DataWidget title="Order activity" data-testid="layout-story">
        <Stack>
          <div data-testid="story-lead">
            <MetricWidget metric={completedOrders} source={source} />
          </div>
          <Grid columns={3} minItemWidth="compact">
            <GridItem span={2} data-testid="story-visual">
              <VisualizationWidget title="Orders over time" dataset={orderDataset} source={source}>
                {(rows) => <p>{rows.length} daily orders</p>}
              </VisualizationWidget>
            </GridItem>
            <StaticVisualizationWidget
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
        dataset={orderDataset}
        source={source}
        title="Paginated orders"
        search={{
          label: "Search orders",
          value: orderSearch,
          onChange: setOrderSearch,
          attributes: [{ name: "order", getter: (order) => order.name }],
        }}
        pagination={{ pageSize: 4 }}
      />
      <p>Connection view ready</p>
    </Stack>
  );
}

function Fixture() {
  return (
    <DataApp
      description="Completed orders in production."
      view={connectionView}
      datasets={[orderDataset]}
      story={(source) => [
        {
          id: "orders",
          headline: "Orders increased",
          visual: <MetricWidget metric={completedOrders} source={source} />,
          evidence: completedOrders,
        },
        {
          id: "customers",
          headline: "More returning customers",
          visual: (
            <VisualizationWidget dataset={orderDataset} source={source}>
              {(rows) => <p>{rows.length} orders</p>}
            </VisualizationWidget>
          ),
          evidence: orderDataset,
        },
      ]}
    >
      <DataSection content={content} />
    </DataApp>
  );
}

injectDataAppStyles();
mountDataApp({ app, component: Fixture });
