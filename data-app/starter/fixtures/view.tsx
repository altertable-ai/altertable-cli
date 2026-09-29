import { createDataClient } from "@altertable/data-app-runtime/client";
import {
  createDataHooks,
  defineDataContent,
  mountDataApp,
} from "@altertable/data-app-runtime/react";
import {
  defineDateRangeContract,
  defineQueryNames,
  type DataOperation,
  type DateRangeRequest,
} from "@altertable/data-app-runtime/contract";
import {
  DataApp,
  Grid,
  GridItem,
  Stack,
  MetricCard,
  ContentSkeleton,
  VisualizationCard,
  dateRangeVariable,
  createDataContext,
  defineDataIdentifiers,
} from "@altertable/data-app-runtime/ui";

type Activity = { count: number; features: string[] };
const config = {
  appearance: { mode: "light" },
  title: "Usage exploration",
  scope: { organization: "Acme", environment: "production" },
};
const calendar = defineDateRangeContract({
  minDate: "2026-01-01",
  maxDate: "2026-03-31",
  maxRangeDays: 31,
  timeZone: "UTC",
});
const period = dateRangeVariable({
  key: "period",
  contract: calendar,
  comparison: true,
  defaultValue: { kind: "dates", start: "2026-03-10", end: "2026-03-12" },
});
const { defineDataView, useView } = createDataHooks<{
  activity: DataOperation<DateRangeRequest, Activity>;
}>(createDataClient());
const activityView = defineDataView({
  operation: "activity",
  variables: { period },
  input: ({ period }) => period,
  describeInput: period.describeInput,
  isEmpty: (data) => data.features.length === 0,
  empty: { title: "No activity in this range", description: "Choose another range." },
});
const identifiers = defineDataIdentifiers({
  tables: { events: { catalog: "product", schema: "analytics", name: "events" } },
  columns: {},
});
const context = createDataContext(defineQueryNames({ activity: "activity" }))({
  identifiers: identifiers.definitions,
  description: (
    <>
      Activity in <identifiers.DataIdentifier id="tables.events" />.
    </>
  ),
  glossary: {
    actions: { term: "Actions", definition: "Recorded product actions.", queryNames: ["activity"] },
  },
});
const content = defineDataContent<Activity, DateRangeRequest>((state) => (
  <Stack data-testid="shared-content">
    <p>
      {state.loading ? "Loading activity…" : `Results for ${period.describeInput(state.input)}`}
    </p>
    <Grid columns={3} minItemWidth="compact" data-testid="shared-grid">
      <GridItem span={2} data-testid="shared-primary">
        {state.loading ? (
          <ContentSkeleton variant="ranking" rows={3} />
        ) : (
          <VisualizationCard
            title="Activity across product features and organizations"
            visual={
              <ul>
                {state.data.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            }
          />
        )}
      </GridItem>
      <GridItem data-testid="shared-support">
        <MetricCard
          label="Actions"
          {...(state.loading
            ? { loading: true }
            : { value: state.data.count, format: { kind: "count" } })}
          evidence={context.evidence({
            id: "actions",
            glossaryIds: ["actions"],
            queryNames: ["activity"],
          })}
        />
      </GridItem>
    </Grid>
  </Stack>
));
function Fixture() {
  const activity = useView(activityView);
  return (
    <DataApp
      config={config}
      request={activity}
      dataContext={context}
      aboutEmpty={{ glossary: { title: "No definitions" }, queries: { title: "No SQL" } }}
      {...content}
    />
  );
}
mountDataApp({ config, component: Fixture });
