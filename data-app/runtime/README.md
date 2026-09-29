# Data app runtime APIs

Start with the task below, then read the linked types. Import through `@altertable/data-app/<entry>`; paths under `src/` are implementation details and can move during upgrades.

`src/core/` contains shared contracts and pure data logic. `src/client/` and `src/server/` depend on core without importing React or UI code. `src/react/` owns hooks and `src/react/ui/` owns components and styles. Apps import the package entries below rather than those source folders.

## Entry points

| Task | Package entry | Start here |
| --- | --- | --- |
| Define bounded operations, live checks, and date ranges | `/contract` | [defineOperation, defineDateRangeContract, parsers](src/core/contract.ts) |
| Author app identity and scope | `/config` | [DataAppConfig](src/core/config.ts) |
| Mount the browser app, load data, and compose its UI | `/react` | [mountDataApp, createDataHooks, DataApp, Grid](src/react/index.ts) |
| Call operations without React | `/client` | [createDataClient](src/client/index.ts) |
| Run locally or host a server | `/server` | [serveLocalApp, localLakehouse, createDataHandler](src/server/index.ts) |
| Set brand tokens and viewer theme | `/appearance` | [parseAppearance, createThemeController](src/core/appearance.ts) |
| Format dates, numbers, ratios, currency, and plural forms | `/format` | [Formatting functions](src/core/format.ts) |

## Find UI by task

All of these APIs are exported from `/react`. Each component's stylesheet lives beside its implementation.

| Task | Start here | Related APIs |
| --- | --- | --- |
| Primary request and page shell | [DataApp](src/react/ui/DataApp.tsx) | AppLayout, AppHeader, AppToolbar, AppFooter, AppScope, ThemeToggle |
| Initial connection check | [GettingStarted](src/react/ui/GettingStarted.tsx) | Pair with `connectionCheck()` from `/contract` |
| Arrange content | [Grid](src/react/ui/Grid.tsx), [Stack](src/react/ui/Stack.tsx) | StorySection |
| Show a key number | [MetricWidget](src/react/ui/MetricWidget.tsx) | ComparisonVisual |
| Show charts and collections | [VisualizationWidget](src/react/ui/VisualizationWidget.tsx), [TableWidget](src/react/ui/TableWidget.tsx) | DataTable, Ranking, Breakdown, chartColor |
| Handle a request's loading, error, and stale data | [DataSection](src/react/ui/DataSection.tsx) | DataBoundary, DataViewToast, EmptyState, StatusPanel, Skeleton |
| Show freshness and refresh | [UpdatedAt](src/react/ui/UpdatedAt.tsx), [AppToolbar](src/react/ui/AppToolbar.tsx) | RefreshRegion, LiveControl |
| Bind filters to the URL | [variables](src/react/ui/variables.ts), [DateRangePicker](src/react/ui/DateRangePicker.tsx) | Combobox, PeriodSummary, Tabs, useViewTab |
| Search a loaded collection | [searchItems](src/react/ui/searchItems.ts), [SearchMatch](src/react/ui/SearchMatch.tsx) | SearchField |
| Explain context, glossary, and queries | [AboutData](src/react/ui/AboutData.tsx), [DataContext](src/react/ui/data-context.ts) | [GlossaryDefinition](src/react/ui/GlossaryDefinition.tsx), GlossaryExplanation, [defineDataIdentifiers](src/react/ui/data-identifiers.tsx) |
| Summarize loaded findings in Present | [PresentSummary](src/react/ui/PlayStory.tsx) | SummaryPoint |
| Build custom controls and overlays | [Button](src/react/ui/Button.tsx), [Sheet](src/react/ui/Sheet.tsx) | IconButton, Tooltip, HelpPopover, Kbd |

## Contracts

| Definition | Runtime owns |
| --- | --- |
| `defineOperation` | Input/output validation, check inputs, query limits and cancellation; `query(name, sql)` accepts registered names and records executed evidence. |
| `defineDataView` | URL variables, operation input, emptiness and the primary date binding. `useView` connects the result and controls to `DataApp`. |
| `DataApp` | Header, variable bar, refresh state, stale-result notice, default inspection empty states. |
| `view.content` | One loading/ready layout. `result.select` never evaluates loading data; `result.metric` binds comparisons to the displayed input. |
| `context.metric` | Label, numeric format, glossary evidence and optional direction of improvement. |
| `WidgetViewTabs` | Valid, unique selection IDs and a required empty state per tab. |

SQL and business definitions belong to the app. Hosted adapters authorize every request; local development uses the CLI proxy. Browser/server boundaries and managed runtime integrity are checked by `app check`. SQL disclosure also requires server permission.

A measured zero and unavailable data have different meanings. Metric readings use `null` for an unavailable previous value. The app defines whether a result is empty. `Breakdown` shows parts of a total; `Ranking` scales against its largest value. Percent formats accept ratios.

`AppLayout` owns the page width, outer gutter, and vertical spacing. App content should not add a second page-level horizontal gutter unless it intentionally narrows the exploration.

For app-authored charts, reveal exact values on hover and keyboard focus. If activating a bar changes a related detail, show the selected value near the chart, keep selection visually distinct from focus, and provide a clear action. Use `aria-pressed` for a toggleable bar and `:focus-visible` for its keyboard focus ring. A bar without a meaningful activation should remain a read-only mark.

`DataApp` owns the title, description, scope, header spacing, and request boundary. Its body starts with controls and exploration; a second `h1` emits a development warning. `defineTimeView` derives a URL date variable, picker, operation input, and displayed-period label from one `time` declaration. For an intentional fixed period, use `defineDataView` with an explicit `describeInput`.

`DataApp.summary` is a callback over the **displayed snapshot**: `summary={({data, input, state}) => findings}`. It is unavailable until data is visible and retains the input that produced stale results. Return one to four findings with stable IDs, headline, visual, and required `evidence` from `context.evidence(...)` or a metric. Choose meaningful relationships and comparisons rather than repeating the page's KPI values. `SelectableBarChart` provides standard inspect-on-select behavior for daily charts.

A categorical dimension is a `dimensionFilter({ key, label, valueType, selection, options, allowMissing })`. `filters: { interface: filter }` on a view generates its control and binds its URL selection. The operation input must preserve that named field or the view throws. On the server, call `parseDimensionSelection` in the input parser and `dimensionPredicate("allowlisted_column", input.interface, ["allowlisted_column"])` in SQL; selected values use centralized escaping, while missing emits `IS NULL` and All emits no predicate. The picker owns search, chips, reset, keyboard interaction, and the selected label. For changing options, `createDataHooks(...).defineFacetFilter({ ..., facet: { operation, input: (otherSelections) => facetInput } })` fetches a bounded operation with 60-second query caching and option loading/error UI. The app's facet input chooses which date and other filters affect counts. Selected values remain visible with a zero count if absent from a newer facet result.

## Ownership

In a generated app, commit `.altertable/runtime/`, including `integrity.json`, with `package.json` and `bun.lock`. The package is a vendored `file:` dependency required by a fresh clone. Read these files to discover APIs; keep application customizations in the app's `src/`. `altertable app upgrade` replaces unmodified runtime files and verifies their checksums.

In the CLI repository, edit the canonical `data-app/runtime/` package. Its sibling starter's `.altertable/runtime/` copy is ignored and recreated by `data-app:setup`.

## Bind a view

```tsx
import { createDataClient } from "@altertable/data-app/client";
import { createDataHooks, dateRangeVariable, DataApp, Grid, MetricWidget, VisualizationWidget, Ranking } from "@altertable/data-app/react";
import type { operations } from "#app/operations.ts";
import { calendar } from "#app/contracts.ts";
import { dataContext, actions } from "#app/data-context.tsx";
import config from "#config";

const period = dateRangeVariable({
  key: "period", contract: calendar, comparison: true,
  defaultValue: { kind: "preset", id: "last-30" },
});
const { defineDataView, useView } = createDataHooks(createDataClient<typeof operations>());
const activityView = defineDataView({
  operation: "activity",
  variables: { period },
  input: ({ period }) => period,
  date: { variable: "period", input: (input) => input },
  isEmpty: (data) => data.features.length === 0,
  empty: { title: "No activity in this range" },
});
const featureEvidence = dataContext.evidence({
  id: "feature-use", queryNames: [dataContext.queryNames.activity],
});
const content = activityView.content((result) => (
  <Grid columns={2}>
    <MetricWidget metric={actions} reading={result.metric((data) => ({
      current: data.count, previous: data.previousCount,
    }))} />
    <VisualizationWidget title="Feature use"
      evidence={featureEvidence}
      reading={result.select((data) => data.features)}
      isEmpty={(features) => features.length === 0}
      empty={{ title: "No features" }}
      skeleton={{ variant: "ranking", rows: 6 }}
    >
      {(features) => <Ranking items={features} />}
    </VisualizationWidget>
  </Grid>
));
function App() {
  const activity = useView(activityView);
  return <DataApp config={config} dataContext={dataContext} request={activity} {...content} />;
}
```

The `date` binding identifies the controlling variable and extracts its range from the operation input. Nested inputs use, for example, `input: (input) => input.period`. The runtime rejects mappings that silently change the selected range or comparison. Non-date views supply `describeInput`; date views can override it when other inputs also need describing.

The shared calendar lives in a browser-safe module:

```ts
import { defineDateRangeContract } from "@altertable/data-app/contract";
export const calendar = defineDateRangeContract({
  minDate: "2026-01-01", maxRangeDays: 90, timeZone: "UTC",
});
// Server operation: input: calendar.parseRequest
```

`useView` generates controls for date, text and fixed-option select variables; custom controls use `result.variables.bind(name)`. `input` chooses which variables reach the operation, so local search can stay local. The callback in `view.content` receives the displayed result, including its original input during refreshes and failures. Hooks belong in the enclosing component.

`TableWidget` also accepts `reading={result.select((data) => data.rows)}` and optional `skeletonRows`. Columns and empty states are declared once for both loading and ready layouts. For bounded results already loaded in the app, pass `pagination={{ pageSize: 8 }}` to page the rows after local search; the footer counts only the supplied rows. `limit` remains a separate, mutually exclusive display cap. Large catalogs need query-backed pagination with a stable sort and total count.

Bound `VisualizationWidget` and `TableWidget` calls require `evidence` from `context.evidence(...)`. A bound `MetricWidget` gets evidence from its metric definition. Evidence must name at least one glossary entry or query. Static widgets may omit it.

`MetricWidget` and `ComparisonVisual` both accept the same `metric` and `reading`. The comparison is enabled by the displayed result's range. The definition supplies formatting and evidence; a reading cannot override those or provide a second value. `favorableDirection` is optional; changes are neutral until the author defines whether up or down is favorable.

`defineDataContent` remains available for manually managed requests. Its optional `{ date: (input) => rangeRequest }` binds comparison readings. `DataSection` handles independent requests. Low-level widgets, tabs and layout components remain available for custom interfaces.

## Execute named queries

```ts
const queries = defineQueryNames({ activity: "feature-activity" });
const activity = defineOperation({
  queryNames: queries,
  input: calendar.parseRequest,
  output: parseActivity,
  checks: [checkInput],
  policy: { maxQueryRows: 100, maxDurationMs: 15000, exposeSql: true },
  async run({ query }, input) {
    const result = await query(queries.activity, buildActivitySql(input));
    return parseActivityRows(result);
  },
});
```

`query` inherits the operation's limit and cancellation signal; `{ limit }` can lower a particular query's bound. Names are checked by TypeScript and at runtime. The server records the SQL and query ID when execution occurs, so evidence does not need a separate result field. Browser modules import operation types with `import type`; they never import server implementations.

## Bind evidence

```tsx
const queries = defineQueryNames({ activity: "feature-activity" });
// In the server operation: queryNames: queries
const identifiers = defineDataIdentifiers({
  tables: { events: { catalog: "product_analytics", schema: "analytics", name: "events" } },
  columns: { identity: { table: "events", name: "identity_uuid" } },
});
const { DataIdentifier } = identifiers;
const context = createDataContext(queries)({
  identifiers: identifiers.definitions,
  description: <>Explore activity in <DataIdentifier id="tables.events" />.</>,
  glossary: {
    identities: {
      term: "Tracked identities",
      definition: <>Distinct <DataIdentifier id="columns.events.identity" /> values.</>,
      queryNames: [queries.activity],
    },
  },
});
const evidence = context.evidence({
  id: "identities",
  glossaryIds: ["identities"],
  queryNames: [queries.activity],
});
const actions = context.metric({
  id: "actions",
  glossaryId: "identities",
  label: "Tracked identities",
  format: { kind: "count" },
});
const finding = {
  id: "activity",
  headline: "Activity concentrated on one day",
  visual: <ActivityChart />,
  evidence: context.evidence({ id: "activity", queryNames: [queries.activity] }),
};
```

Import `defineQueryNames` from `/contract` and the context/identifier factories from `/ui`. Use the same registry in `defineOperation({ queryNames: queries, ... })`. Unknown glossary/query references fail type checks and registry validation; the server also validates returned query names. Physical source identity stays in the identifier registry for future linking.

## API migration

- Replace `DataApp.story` and static `summary` objects with `summary={({ data, input, state }) => findings}`. Each finding must carry registered evidence.
- Views that previously inferred their date variable now declare `date: { variable: "period", input: (input) => input }`, or supply `describeInput` for a non-date view.
- Numeric metrics use `value={count} format={{ kind: "count" }}`. Custom formatted JSX or strings use `content={...}` instead of `value`.
- Supply `empty` to secondary `DataSection` requests or pass a bound `useView` result. A primary `DataApp` accepts it either from `useView` or as an explicit prop.
- For alternate views of the same bound result, pass `views={[{ id, label, render }]}` and `viewLabel` to `VisualizationWidget`. Its required `isEmpty` and `empty` apply to the whole result; the widget owns selection. Use `WidgetViewTabs` directly only when views have independent empty states.
- Variable URL keys cannot use `view`, `about`, `tab`, `present`, or `step`.
