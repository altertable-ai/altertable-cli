import { mountDataApp } from "@altertable/data-app-runtime/react";
import { createDataHooks } from "@altertable/data-app-runtime/react";
import { createDataClient } from "@altertable/data-app-runtime/client";
import { connectionCheck } from "@altertable/data-app-runtime/contract";
import {
  DataApp,
  DataSection,
  defineDataIdentifiers,
  ContentSkeleton,
  DateRangePicker,
  Grid,
  GridItem,
  MetricCard,
  Stack,
  StorySection,
  VisualizationCard,
} from "@altertable/data-app-runtime/ui";

const { useDataView } = createDataHooks<{ connection: ReturnType<typeof connectionCheck> }>(
  createDataClient(),
);

const config = {
  title: "Orders exploration",
  scope: { organization: "Acme", environment: "production" },
  appearance: { mode: "light" },
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
      description="Completed orders in production."
      dataContext={dataContext}
      aboutEmpty={empty}
      request={connection}
      variables={<DateRangePicker value={null} onChange={() => {}} label="Date range" />}
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
        <Grid columns={3} minItemWidth="compact" data-testid="peer-grid">
          <MetricCard label="Actions" value="120" />
          <MetricCard label="Identities" value="40" />
          <MetricCard label="Organizations" value="26" />
        </Grid>
        <Grid columns={3} minItemWidth="compact" data-testid="spanned-grid">
          <GridItem span={2} data-testid="primary-grid-item">
            <VisualizationCard title="Primary view" visual={<p>Product activity</p>} />
          </GridItem>
          <GridItem data-testid="support-grid-item">
            <VisualizationCard title="Supporting view" visual={<p>Feature reach</p>} />
          </GridItem>
        </Grid>
        <StorySection
          label="Order activity"
          data-testid="layout-story"
          lead={<MetricCard label="Completed orders" value="120" />}
          visual={<VisualizationCard title="Orders over time" visual={<p>Daily orders</p>} />}
          support={<VisualizationCard title="Returning customers" visual={<p>80 customers</p>} />}
        />
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
        <DataSection
          result={connection}
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
        >
          {() => <p>Connection view ready</p>}
        </DataSection>
      </Stack>
    </DataApp>
  );
}

mountDataApp({ config, component: Fixture });
