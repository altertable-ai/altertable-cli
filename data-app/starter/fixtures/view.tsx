import { createDataClient } from "@altertable/data-app/client";
import {
  createDataHooks,
  DataApp,
  DataSection,
  Grid,
  GridItem,
  injectDataAppStyles,
  MetricWidget,
  mountDataApp,
  Stack,
  VisualizationWidget,
} from "@altertable/data-app/react";
import {
  defineDateRangeContract,
  defineQueryNames,
  type DataOperation,
  type DateRangeRequest,
} from "@altertable/data-app/contract";
import {
  createDataContext,
  dateRangeVariable,
  defineDataIdentifiers,
} from "@altertable/data-app/react";

type Activity = { count: number; features: string[] };
const config = {
  appearance: { theme: "light" as const },
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
const { defineDataView } = createDataHooks<{
  activity: DataOperation<DateRangeRequest, Activity>;
}>(createDataClient());
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
const activityView = defineDataView({
  dataContext: context,
  operation: "activity",
  variables: { period },
  input: ({ period }) => period,
  date: { variable: "period", input: (input) => input },
  describeInput: (input) => period.describeInput(input),
  isEmpty: (data) => data.features.length === 0,
  emptyFallback: { title: "No activity in this range", description: "Choose another range." },
});
const features = activityView.dataset({
  name: "Features",
  select: (data) => data.features,
  rowKey: (feature) => feature,
  columns: { feature: { value: (feature) => feature } },
  evidence: { id: "activity", queryNames: ["activity"] },
  emptyFallback: { title: "No features" },
});
const actions = activityView.metric(
  { id: "actions", glossaryId: "actions", format: { kind: "count" } },
  (data) => ({ current: data.count }),
);
const content = activityView.content((source) => (
  <Stack data-testid="shared-content">
    <p>{source.loading ? "Loading activity…" : `Results for ${source.scope.value}`}</p>
    <Grid columns={3} minItemWidth="compact" data-testid="shared-grid">
      <GridItem span={2} data-testid="shared-primary">
        <VisualizationWidget
          title="Activity across product features and organizations"
          dataset={features}
          source={source}
        >
          {(rows) => <ul>{rows.map((feature) => <li key={feature}>{feature}</li>)}</ul>}
        </VisualizationWidget>
      </GridItem>
      <GridItem data-testid="shared-support">
        <MetricWidget metric={actions} source={source} />
      </GridItem>
    </Grid>
  </Stack>
));
function Fixture() {
  return (
    <DataApp
      config={config}
      view={activityView}
      datasets={[features]}
      story={(source) => {
        const reading = actions.read(source);
        return [
          {
          id: "activity",
          headline: `${reading.value.current} recorded actions`,
          visual: <MetricWidget metric={actions} source={source} />,
          evidence: actions,
        },
        ];
      }}
    >
      <DataSection content={content} />
    </DataApp>
  );
}
injectDataAppStyles();
mountDataApp({ config, component: Fixture });
