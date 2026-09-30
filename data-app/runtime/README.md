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
| Bind an operation to inputs and displayed data | [createDataHooks](src/react/hooks.ts), [DataViewDefinition](src/react/view.ts) | defineTimeView, defineDataView, useView, view.content |
| Primary request and page shell | [DataApp](src/react/ui/DataApp.tsx) | AppLayout, AppHeader, AppToolbar, AppFooter, AppScope, ThemeToggle |
| Initial connection check | [GettingStarted](src/react/ui/GettingStarted.tsx) | Pair with `connectionCheck()` from `/contract` |
| Arrange content | [Grid](src/react/ui/Grid.tsx), [Stack](src/react/ui/Stack.tsx) | GridItem |
| Fade only scrollable edges | [GradientScroll](src/react/ui/GradientScroll.tsx) | Vertical or horizontal; observes content and viewport size |
| Show a key number | [MetricWidget](src/react/ui/MetricWidget.tsx) | ComparisonVisual |
| Compose a custom evidence-backed widget | [DataWidget](src/react/ui/DataWidget.tsx) | Reading, loading, empty state, inspection, actions, footer |
| Show charts and collections | [VisualizationWidget](src/react/ui/VisualizationWidget.tsx), [TableWidget](src/react/ui/TableWidget.tsx) | DataTable, Ranking, Breakdown, chartColor |
| Handle a request's loading, error, and stale data | [DataSection](src/react/ui/DataSection.tsx) | DataBoundary for custom state rendering; DataViewToast, EmptyState, StatusPanel, Skeleton |
| Show freshness and refresh | [UpdatedAt](src/react/ui/UpdatedAt.tsx), [AppToolbar](src/react/ui/AppToolbar.tsx) | RefreshRegion, LiveControl |
| Filter categorical source dimensions | [dimensionFilter](src/core/dimension.ts), [DimensionPicker](src/react/ui/DimensionPicker.tsx) | defineFacetFilter, parseDimensionSelection, dimensionPredicate |
| Bind filters to the URL | [variables](src/react/ui/variables.ts), [DateRangePicker](src/react/ui/DateRangePicker.tsx) | Combobox, PeriodSummary, Tabs, useViewTab |
| Search a loaded collection | [searchItems](src/react/ui/searchItems.ts), [SearchMatch](src/react/ui/SearchMatch.tsx) | SearchField |
| Explain context, glossary, and queries | [AboutData](src/react/ui/AboutData.tsx), [createDataContext](src/react/ui/data-context.ts) | [GlossaryDefinition](src/react/ui/GlossaryDefinition.tsx), GlossaryExplanation, [defineDataIdentifiers](src/react/ui/data-identifiers.tsx) |
| Present an evidence-backed story | [PresentStory](src/react/ui/PresentStory.tsx) | StoryFinding, BoundStory |
| Build custom controls and overlays | [Button](src/react/ui/Button.tsx), [Sheet](src/react/ui/Sheet.tsx) | Checkbox, SearchField, Combobox, IconButton, Tooltip, HelpPopover, Kbd |

## Bind a view

Start with `createDataHooks(client).defineTimeView` for reader-controlled periods, or `defineDataView` for other input shapes. Read the [hook contracts](src/react/hooks.ts), [input bindings](src/react/view.ts), and [content selectors](src/react/content.ts); component prop types define loading, empty states, pagination, and inspection ownership.

## Execute named queries

Define server operations with [defineOperation and defineQueryNames](src/core/contract.ts). Browser modules import operation types with `import type`. SQL and business definitions belong to the app. Hosted adapters authorize every request; see the [server boundary](src/server/index.ts).

## Bind evidence

Use [createDataContext](src/react/ui/data-context.ts) for glossary, query, metric, and finding references. Register physical source names with [defineDataIdentifiers](src/react/ui/data-identifiers.tsx). Import both factories from `/react`.

## Ownership

In a generated app, commit `.altertable/runtime/`, including `integrity.json`, with `package.json` and `bun.lock`. The package is a vendored `file:` dependency required by a fresh clone. Read these files to discover APIs; keep application customizations in the app's `src/`. `altertable app upgrade` replaces unmodified runtime files and verifies their checksums.

In the CLI repository, edit the canonical `data-app/runtime/` package. Its sibling starter's `.altertable/runtime/` copy is ignored and recreated by `data-app:setup`.

## Stable asynchronous feedback

Widgets (`DataWidget`, `VisualizationWidget`, `TableWidget`, and `MetricWidget`) own a reserved feedback slot. Pass `status={{ kind: "updating" }}` while refreshing or `status={{ kind: "error", onRetry }}` after failure; omit status or use `kind: "idle"` for ready content. Default copy, indicator, retry adjacency, accessibility, truncation and reduced motion belong to the runtime. Optional `message` overrides the copy. Keep the last displayed content mounted. Initial loading uses the bound reading's skeleton. Widget inspection includes the same feedback slot.

`Combobox` keeps known choices selectable during loading, shows progress in the search glyph's existing space, and groups failure and retry in a reserved row. With no known choices it renders skeleton rows. Apps supply asynchronous state and callbacks; they do not insert loading paragraphs or custom refresh banners.

The development gallery at `/gallery` in `data-app/tests/server.ts` covers control variants, picker and widget transitions, formats, empty and extreme values, pagination, overflow, request recovery, dates, overlays and Story. Use its section links and state controls to review both themes and narrow layouts without a live source.
