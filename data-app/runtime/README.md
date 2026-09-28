# Data app runtime APIs

Start with the task below, then read the linked types. Import through `@altertable/data-app-runtime/<entry>`; paths under `src/` are implementation details and can move during upgrades.

## Entry points

| Task | Package entry | Start here |
| --- | --- | --- |
| Define bounded operations and parse results | `/contract` | [defineOperation, parsers, Lakehouse](src/contract.ts) |
| Author app identity and scope | `/config` | [DataAppConfig](src/config.ts) |
| Mount the browser app and load data | `/react` | [mountDataApp, createDataHooks, useDataView](src/react.tsx) |
| Call operations without React | `/client` | [createDataClient](src/client.ts) |
| Run locally through the CLI proxy | `/local` | [serveLocalApp, localLakehouse](src/local.ts) |
| Author a hosted server | `/server` | [createDataHandler, RequestAccess](src/server.ts) |
| Set brand tokens and viewer theme | `/appearance` | [parseAppearance, createThemeController](src/appearance.ts) |
| Format counts, ratios, and labels | `/format` | [Formatting functions](src/format.ts) |
| Compose a view | `/ui` | [All public components and types](src/ui/index.ts) |
| Select a semantic icon | `/icons` | [AppIcon and icon names](src/ui/primitives/icons.ts) |

## Find UI by task

All of these APIs are exported from `/ui`. Each component's stylesheet lives beside its implementation.

| Task | Start here | Related APIs |
| --- | --- | --- |
| Standard page shell | [DataApp](src/ui/app/DataApp.tsx) | AppLayout, AppHeader, AppToolbar, AppFooter, AppScope, ThemeToggle |
| Initial connection check | [GettingStarted](src/ui/app/GettingStarted.tsx) | Pair with `connectionCheck()` from `/contract` |
| Arrange content | [Grid](src/ui/layout/Grid.tsx), [Stack](src/ui/layout/Stack.tsx) | StorySection |
| Show a key number | [MetricCard](src/ui/cards/MetricCard.tsx) | ComparisonVisual |
| Show charts and collections | [VisualizationCard](src/ui/cards/VisualizationCard.tsx), [TableCard](src/ui/cards/TableCard.tsx) | DataTable, Ranking, Breakdown, CardEvidence |
| Handle a request's loading, error, and stale data | [DataSection](src/ui/requests/DataSection.tsx) | DataBoundary, DataViewToast, EmptyState, StatusPanel, Skeleton |
| Show freshness and refresh | [UpdatedAt](src/ui/requests/UpdatedAt.tsx), [AppToolbar](src/ui/app/AppToolbar.tsx) | RefreshRegion, LiveControl |
| Bind filters to the URL | [variables](src/ui/controls/variables.ts), [DateRangePicker](src/ui/controls/DateRangePicker.tsx) | Combobox, PeriodSummary, Tabs, useViewTab |
| Search a loaded collection | [searchItems](src/ui/controls/searchItems.ts), [SearchMatch](src/ui/controls/SearchMatch.tsx) | SearchField |
| Explain context, glossary, and queries | [AboutData](src/ui/inspect/AboutData.tsx), [DataContext](src/ui/inspect/data-context.ts) | GlossaryExplanation |
| Present loaded findings | [PlayStory](src/ui/presentation/PlayStory.tsx) | StoryStep |
| Build custom controls and overlays | [Button](src/ui/primitives/Button.tsx), [Sheet](src/ui/primitives/Sheet.tsx) | IconButton, Tooltip, HelpPopover, Kbd |

## Boundaries to preserve

- SQL, credentials, and viewer authorization stay on the server. Hosted apps must authorize each request; the local adapter is for CLI development. SQL disclosure requires both operation policy and server permission.
- `useDataView` distinguishes requested inputs from the inputs that produced visible data. Let the app define emptiness; a measured zero can be a valid result.
- `Breakdown` shows parts of a total; `Ranking` scales against the largest visible value. `formatPercent` accepts a ratio, for example `0.116` for 11.6%.
- App variables own URL state. `?view=` belongs to page navigation; `?about=` and `?tab=` belong to inspection; `?present=` and `?step=` belong to Present mode.
- Present steps use an already loaded result. They carry authored findings and evidence references, without issuing another query.

## Ownership

In a generated app, commit `.altertable/runtime/`, including `integrity.json`, with `package.json` and `bun.lock`. The package is a vendored `file:` dependency required by a fresh clone. Read these files to discover APIs; keep application customizations in the app's `src/`. `altertable app upgrade` replaces unmodified runtime files and verifies their checksums.

In the CLI repository, edit the canonical `data-app/runtime/` package. Its sibling starter's `.altertable/runtime/` copy is ignored and recreated by `data-app:setup`.
