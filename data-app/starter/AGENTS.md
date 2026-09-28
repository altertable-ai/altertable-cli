# Working on this data app

Build from observed lakehouse data. The app owns its question, operations, data context, and view; `.altertable/runtime/` owns transport and shared UI. Edit `src/`, not generated runtime files. Read component JSDoc for exact props and slots.

## Start with evidence

1. Read `app.json` and confirm its organization and environment against the connected source and `altertable profile show --json`. A starter created with `--without-profile` has placeholders; resolve them before querying. If the scopes differ, stop and show both. Offer `altertable profile switch <name>` for a matching profile or `altertable login --org <org> --env <env>` to connect the intended one.
2. Use the [Altertable MCP](https://altertable.ai/docs/query-data/mcp) to inspect catalogs, tables, columns, and existing definitions. If it is disconnected, ask to connect it; use `altertable catalogs` and `altertable query` if connection fails or the user declines. The app never calls MCP at runtime.
3. Write a description of what the reader is exploring and why, and define a glossary of terms in `src/data-context.ts`. Make the description specific to the operation's SQL and its coverage. Validate one bounded query in the intended environment, then implement it with input and output parsers in `src/operations.ts`.
4. For a broad request such as “how people use the product,” inspect the event taxonomy and available identity, organization, and time fields before settling on a view. Explore distinct angles (for example activity over time, feature reach, and usage by organization), then choose the strongest supported story and enough complementary views to answer the request. A first query proves the path; it does not establish the exploration's coverage.
5. Show the first useful result and its interpretation in `src/App.tsx`, then add the other supported questions. Build optional Present steps from the loaded result. Never invent data or treat an observed association as a proven cause.

## Files and data flow

| File                  | Owns                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `app.json`            | Title, verified scope, appearance, and fixed sample inputs for operation checks. These fixtures are not live defaults. |
| `src/operations.ts`   | Bounded server-side queries and validation. Credentials stay on the server.                                            |
| `src/variables.ts`    | Add when filters are needed: reader-controlled defaults, URL state, and operation inputs.                              |
| `src/data-context.ts` | Exploration description and glossary.                                                                                  |
| `src/App.tsx`         | Questions, filters, result states, cards, and optional story.                                                          |

- Prefer a dynamic, source-bounded date range for ongoing questions. Declare it with `dateRangeVariable`, including timezone, complete-day policy, bounds, maximum range, and a relative default. Resolve the selected range into the operation input so `useDataQuery` keys each request correctly. Use a fixed period only for a deliberate historical snapshot or rolling sub-day question; explain that choice in the data context.
- Define other filters with `selectVariable` or `textVariable`. `useAppVariables` owns URL parsing, reset, and Back/Forward. Bind controls to those values; keep local search out of operation inputs. Use `useViewTab` for top-level `?view=` navigation.
- Use `createDataHooks(createDataClient<typeof operations>())` and its `useDataView` for each fetched view. Supply `isEmpty` and `describeInput`, then pass the returned result to `<DataSection result={view}>`. It handles loading, empty, error, retry, and stale results while preserving the input that produced visible data. Keep a measured zero in the ready state. Independent operations need independent retry boundaries. The starter's connection check is a setup state.
- Do not substitute a copied result when a live request is loading or fails. A snapshot needs a separate, clearly dated historical view. Let `DataSection` display the actual request state, and use a relative date variable for an ongoing usage question.

## Compose the view

Choose the layout by the relationship between results: one lead finding with a main visual and smaller context uses `StorySection`; equally important cards use `Grid`; consecutive sections use `Stack`. Do not put the lead, its evidence, and its context in three equal grid cells. For example, inside a loaded result view:

```tsx
<StorySection
  label="Feature activity"
  lead={<MetricCard label="Most used feature" value={result.topFeature.label} />}
  visual={<VisualizationCard title="Actions by feature" visual={<Ranking items={result.featureActions} />} />}
  support={<VisualizationCard title="Identities by feature" visual={<Ranking items={result.featureReach} />} />}
/>
```

| Need                     | Runtime primitive                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Page and hierarchy       | `DataApp` for the standard shell; `StorySection`, `Grid`, `Stack` for content |
| Key number               | `MetricCard` with semantic `label`, `value`, and optional context slots             |
| Chart, ranking, or rows  | `VisualizationCard`, `Ranking`, `TableCard`, `Breakdown`                            |
| Filters and search       | `DateRangePicker`, `Combobox`, `SearchField`, `searchItems`, `SearchMatch`          |
| Details and presentation | `AboutData`, card `evidence`, `CardDisclosure`, `PlayStory`                         |

- Lead with the strongest observed fact. Give the main visual more space than supporting metrics and lists; avoid repeating the lead value. For a long list with related compact metrics, put the metrics on the left quarter and the list on the right at wide widths, then stack them on phones.
- Use `Breakdown` for parts of one total and `Ranking` for values compared with the largest visible item. Give numeric table columns their numeric type. Search the complete local collection before limiting rows, and render visible matches with `SearchMatch`.
- Place consecutive sections in `Stack` and peer cards in `Grid`; both use the page's 24px section gap by default. `Grid columns` is a maximum and wraps against its own width; choose `minItemWidth="compact"` for short KPIs or `"wide"` for detailed visuals. Cards keep content height, so use `align="stretch"` only when equal-height cards help the reading. `DataApp` owns page width and outer padding; do not add another width or padding wrapper or nest a second `main` inside it.
- Use chart color by meaning: accent plus neutral for one series, stable distinct hues for categories, a lightness scale for ordered magnitude, and two ordered hues around a meaningful midpoint for signed change. Keep category colors consistent across views and themes. Mark notable values from data, not DOM position. Provide text labels and `Tooltip variant="chart"` on marks; touch must reveal the same information.
- Put stable glossary and query references in each card's `evidence`. Write the page as question, evidence, interpretation, and next question. Use `PlayStory` only for distinct observations a room can read from a distance; link relevant glossary terms and queries to each step. Conclude only when the data supports it.
- Give `DataApp` an `aboutEmpty` value and each inspectable card or story step an `empty` value. Both Glossary and Queries need a concise, relevant fallback when their content is absent. Keep necessary caveats in About the data; make on-page copy specific to the current result.
- Pass `app.json`, `dataContext`, and a `useDataView` result as `request` to `DataApp`. Put reader-controlled date ranges and filters in `variables`; `DataApp` renders them in a separate bar below the header divider. Use `toolbarActions` only for page actions alongside Refresh and About the data. A display-only `scopeLabels` override can capitalize the organization without changing the authentication scope in `app.json`. For multiple operations, pass combined query evidence and refresh behavior explicitly. `DataApp` owns the page identity, theme control, About the data, and default toolbar. Keep the authored question and interpretation in its children. The generated `main.tsx` and `server.ts` already use `mountDataApp` and `serveLocalApp`; hosted servers must use `createDataHandler` with viewer authorization.
- The `request` also drives the toolbar's loading and updating label beside Refresh. Do not repeat a date range in the page heading when the date control already shows it; `DataSection` labels previously loaded ranges during updates.
- Use the React-free parsers in `@altertable/data-app-runtime/contract` for empty input, bounded dates, counts, labels, and named query rows when they match the data contract. Define app-specific input and output validation in the operation. Never move source-specific SQL, populations, or metric definitions into shared runtime helpers.
- Set `app.json` title, scope, and appearance for the organization's brand. Keep the document title as `{app title} • {org}/{env} • Altertable app`. Use accessible controls and semantic icons. Essential actions must work without hover. The page must not overflow horizontally.

## Verify and maintain

Run `altertable app check` for format, lint, types, contracts, build, and credential leak checks. Run `altertable app check --lakehouse` with the matching profile after changing operations or inputs; it executes the fixed `app.json` fixtures. Review the rendered app at desktop and phone widths in both themes, including loading, empty, zero, and error states.

After updating the CLI, run `altertable app upgrade` and check again. Upgrade refuses modified generated runtime files; keep custom code in `src/`.
