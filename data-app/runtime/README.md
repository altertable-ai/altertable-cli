# Data app runtime APIs

Start with the task below, then read the linked types. Import through `@altertable/data-app-runtime/<entry>`; paths under `src/` are implementation details and can move during upgrades.

## Entry points

| Task | Package entry | Start here |
| --- | --- | --- |
| Define bounded operations, live checks, and date ranges | `/contract` | [defineOperation, defineDateRangeContract, parsers](src/contract.ts) |
| Author app identity and scope | `/config` | [DataAppConfig](src/config.ts) |
| Mount the browser app and load data | `/react` | [mountDataApp, createDataHooks, defineDataView, useView](src/react.tsx) |
| Call operations without React | `/client` | [createDataClient](src/client.ts) |
| Run locally through the CLI proxy | `/local` | [serveLocalApp, localLakehouse](src/local.ts) |
| Author a hosted server | `/server` | [createDataHandler, RequestAccess](src/server.ts) |
| Set brand tokens and viewer theme | `/appearance` | [parseAppearance, createThemeController](src/appearance.ts) |
| Format dates, numbers, ratios, currency, and plural forms | `/format` | [Formatting functions](src/format.ts) |
| Compose a view | `/ui` | [All public components and types](src/ui/index.ts) |
| Select a semantic icon | `/icons` | [AppIcon and icon names](src/ui/icons.ts) |

## Find UI by task

All of these APIs are exported from `/ui`. Each component's stylesheet lives beside its implementation.

| Task | Start here | Related APIs |
| --- | --- | --- |
| Primary request and page shell | [DataApp](src/ui/DataApp.tsx) | AppLayout, AppHeader, AppToolbar, AppFooter, AppScope, ThemeToggle |
| Initial connection check | [GettingStarted](src/ui/GettingStarted.tsx) | Pair with `connectionCheck()` from `/contract` |
| Arrange content | [Grid](src/ui/Grid.tsx), [Stack](src/ui/Stack.tsx) | StorySection |
| Show a key number | [MetricCard](src/ui/MetricCard.tsx) | ComparisonVisual |
| Show charts and collections | [VisualizationCard](src/ui/VisualizationCard.tsx), [TableCard](src/ui/TableCard.tsx) | DataTable, Ranking, Breakdown, chartColor |
| Handle a request's loading, error, and stale data | [DataSection](src/ui/DataSection.tsx) | DataBoundary, DataViewToast, EmptyState, StatusPanel, Skeleton |
| Show freshness and refresh | [UpdatedAt](src/ui/UpdatedAt.tsx), [AppToolbar](src/ui/AppToolbar.tsx) | RefreshRegion, LiveControl |
| Bind filters to the URL | [variables](src/ui/variables.ts), [DateRangePicker](src/ui/DateRangePicker.tsx) | Combobox, PeriodSummary, Tabs, useViewTab |
| Search a loaded collection | [searchItems](src/ui/searchItems.ts), [SearchMatch](src/ui/SearchMatch.tsx) | SearchField |
| Explain context, glossary, and queries | [AboutData](src/ui/AboutData.tsx), [DataContext](src/ui/data-context.ts) | [GlossaryDefinition](src/ui/GlossaryDefinition.tsx), GlossaryExplanation, [defineDataIdentifiers](src/ui/data-identifiers.tsx) |
| Present loaded findings | [PlayStory](src/ui/PlayStory.tsx) | StoryStep |
| Build custom controls and overlays | [Button](src/ui/Button.tsx), [Sheet](src/ui/Sheet.tsx) | IconButton, Tooltip, HelpPopover, Kbd |

## Boundaries to preserve

- SQL, credentials, and viewer authorization stay on the server. Hosted apps must authorize each request; the local adapter is for CLI development. SQL disclosure requires both operation policy and server permission.
- `useDataView` distinguishes requested inputs from the inputs that produced visible data. Pass it once to `DataApp.request`; the shell owns the primary boundary, refresh notice, and inspection defaults. Use `DataSection` for independent requests. Let the app define emptiness; a measured zero can be a valid result.
- Each operation declares `checks` beside its input parser. `app check --lakehouse` runs them; `app.json` owns identity and appearance. `defineDateRangeContract` shares a calendar range's parser, variable bounds, and displayed period.
- To offer a previous-period comparison, set `comparison: true` on `dateRangeVariable`. `dateRangeControl` adds the picker control and URL state; `variable.comparisonRange(selection)` returns the immediately preceding equal-length range only when selected and within source coverage. Use `variable.input(selection)` or a bound view to resolve both ranges; `calendar.parseRequest` validates the operation input. Query both ranges in the operation. The runtime does not infer comparison results from current-period data.
- `createDataContext(queryNames)` validates glossary query references and supplies typed `context.evidence`. Card inspection inherits context, queries, and empty states from `DataApp`.
- `Breakdown` shows parts of a total; `Ranking` scales against the largest visible value. `formatPercent` accepts a ratio, for example `0.116` for 11.6%.
- Default page, grid, and stack gaps scale with the viewport and appearance density. Keep body and label text legible; scale display headlines instead.
- Use `GlossaryDefinition` for a term in running text: `<GlossaryDefinition entry={dataContext.glossary.orders}>completed orders</GlossaryDefinition>`. It shows the registered definition on hover or activation; `AboutData` remains the place for full evidence.
- Variable registration rejects duplicate and reserved URL keys. App variables own URL state. `?view=` belongs to page navigation; `?about=` and `?tab=` belong to inspection; `?present=` and `?step=` belong to Present mode.
- Present steps use an already loaded result. They carry authored findings and evidence references, without issuing another query.

## Ownership

In a generated app, commit `.altertable/runtime/`, including `integrity.json`, with `package.json` and `bun.lock`. The package is a vendored `file:` dependency required by a fresh clone. Read these files to discover APIs; keep application customizations in the app's `src/`. `altertable app upgrade` replaces unmodified runtime files and verifies their checksums.

In the CLI repository, edit the canonical `data-app/runtime/` package. Its sibling starter's `.altertable/runtime/` copy is ignored and recreated by `data-app:setup`.

## Bind a view

Definitions live in browser-safe modules. Import operation types with `import type`; the browser bundle must not import operation implementations. The request and UI contracts do not depend on a particular hosting adapter.

```tsx
import { createDataClient } from "@altertable/data-app-runtime/client";
import { createDataHooks, defineDataContent } from "@altertable/data-app-runtime/react";
import { dateRangeVariable, DataApp, Grid, MetricCard } from "@altertable/data-app-runtime/ui";
import type { operations } from "./operations.ts";
import { calendar } from "./contracts.ts";

const period = dateRangeVariable({
  key: "period",
  contract: calendar,
  comparison: true,
  defaultValue: { kind: "preset", id: "last-30" },
});
const { defineDataView, useView } = createDataHooks(createDataClient<typeof operations>());
const activityView = defineDataView({
  operation: "activity",
  variables: { period },
  input: ({ period }) => period,
  describeInput: period.describeInput,
  isEmpty: (data) => data.features.length === 0,
  empty: { title: "No activity in this range" },
});

function App() {
  const activity = useView(activityView);
  return (
    <DataApp config={config} dataContext={dataContext} aboutEmpty={aboutEmpty} request={activity}>
      {(data, displayedInput) => (
        <MetricCard label="Actions" value={data.count} format={{ kind: "count" }} />
      )}
    </DataApp>
  );
}
```

`useView` generates date, text, and fixed-option select controls; `variables` can override the shell's controls. Its `variables.bind(name)` supports custom controls. `input` explicitly selects which resolved variables affect the operation, so local search can stay out of query inputs. Labels, emptiness, and input mapping are declared once. `useDataView` remains available for requests with manually managed inputs.

A date resolves to `{ range, comparison }`, with comparison `null` when disabled. Define the shared contract in `src/contracts.ts`:

```ts
import { defineDateRangeContract } from "@altertable/data-app-runtime/contract";

export const calendar = defineDateRangeContract({
  minDate: "2026-01-01",
  maxRangeDays: 90,
  timeZone: "UTC",
});
// In defineOperation: input: calendar.parseRequest
```

The parser rejects forged comparisons and out-of-coverage ranges. The same parser can run behind any deployment adapter. Result children receive the displayed input, including its comparison range, even while controls request something else.

## Share loading structure

`defineDataContent<Data, Input>` returns the `loading` and `children` props for `DataApp` or `DataSection`. Its pure render callback receives a loading/ready union. Keep hooks in the enclosing component.

```tsx
const content = defineDataContent<Activity, DateRangeRequest>((state) => (
  <Grid columns={3}>
    <MetricCard
      label="Actions"
      {...(state.loading
        ? { loading: true }
        : { value: state.data.count, format: { kind: "count" } })}
    />
    {/* Additional cards use this same grid in both states. */}
  </Grid>
));
// <DataApp ... request={activity} {...content} />
```

`ContentSkeleton` accepts `variant="ranking" rows={6}` for a representative collection shape. Placeholder values never become successful results. `DataSection` requires an empty fallback on its props or bound result; `CardViewTabs` requires `isEmpty` and `empty` on each view. Low-level React Aria tabs remain available for non-data interfaces.

## Bind evidence

```tsx
const queries = defineQueryNames({ activity: "feature-activity" });
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
```

Import `defineQueryNames` from `/contract` and the context/identifier factories from `/ui`. Unknown glossary/query references fail type checks and registry validation. Physical source identity stays in the identifier registry for future linking.

## API migration

- Numeric metrics use `value={count} format={{ kind: "count" }}`. Custom formatted JSX or strings use `content={...}` instead of `value`.
- Supply `empty` to secondary `DataSection` requests or pass a bound `useView` result. A primary `DataApp` accepts it either from `useView` or as an explicit prop.
- Each `CardViewTabs` view supplies `isEmpty` and `empty`.
- Variable URL keys cannot use `view`, `about`, `tab`, `present`, or `step`.
