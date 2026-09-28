# View authoring

Find implementations and types through the [UI API map](../.altertable/runtime/README.md#find-ui-by-task).

| Need                     | Runtime primitive                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Page and hierarchy       | `DataApp` for the standard shell; `StorySection`, `Grid`, `Stack` for content |
| Key number               | `MetricCard` with semantic `label`, `value`, and optional context slots             |
| Chart, ranking, or rows  | `VisualizationCard`, `Ranking`, `TableCard`, `Breakdown`                            |
| Filters and search       | `DateRangePicker`, `Combobox`, `SearchField`, `searchItems`, `SearchMatch`          |
| Details and presentation | `AboutData`, card `evidence`, `CardDisclosure`, `PlayStory`                         |

- Lead with the strongest observed fact. Give the main visual more space than supporting metrics and lists; avoid repeating the lead value. For a long list with related compact metrics, put the metrics on the left quarter and the list on the right at wide widths, then stack them on phones.
- Place consecutive sections in `Stack` and peer cards in `Grid`; both use the page's section gap by default. `Grid columns` is a maximum and wraps against its own width. Use `GridItem span={2}` in a three-column grid for a wider primary card. Keep the same structure for its loading skeleton. `DataApp` owns page width and outer padding; do not add another page wrapper or `main` element.
- Use `Breakdown` for parts of one total and `Ranking` for values compared with the largest visible item. Give numeric table columns their numeric type. Search the complete local collection before limiting rows, and render visible matches with `SearchMatch`.
- Use chart color by meaning: accent plus neutral for one series, stable distinct hues for categories, a lightness scale for ordered magnitude, and two ordered hues around a meaningful midpoint for signed change. Keep category colors consistent across views and themes. Mark notable values from data, not DOM position. Provide text labels and `Tooltip variant="chart"` on marks; touch must reveal the same information.
- Put stable glossary and query references in each card's `evidence`. Write the page as question, evidence, interpretation, and next question. Use `PlayStory` only for distinct observations a room can read from a distance; link relevant glossary terms and queries to each step. Conclude only when the data supports it.
- Pass `app.json`, `dataContext`, and a `useDataView` result as `request` to `DataApp`. Add optional filters and Present steps when the view needs them. For multiple operations, pass combined query evidence and refresh behavior explicitly. `DataApp` owns the page identity, theme control, About the data, and default toolbar. Keep the authored question and interpretation in its children. The generated `main.tsx` and `server.ts` already use `mountDataApp` and `serveLocalApp`; hosted servers must use `createDataHandler` with viewer authorization.
- Give `DataApp` an `aboutEmpty` value and each inspectable card or story step an `empty` value. Glossary and Queries need concise, relevant fallbacks. Put date ranges and filters in `variables`, below the header divider; reserve `toolbarActions` for page actions. `scopeLabels` changes display casing without changing authentication scope. The `request` drives the loading and updating label beside Refresh.
- Set `app.json` title, scope, and appearance for the organization's brand. Keep the document title as `{app title} • {org}/{env} • Altertable app`. Use accessible controls and semantic icons. Essential actions must work without hover. The page must not overflow horizontally.

## Request states and verification

- Use `createDataHooks(createDataClient<typeof operations>())` and its `useDataView` for each fetched view. Supply `isEmpty` and `describeInput`, then pass the returned result to `<DataSection result={view}>`. It handles loading, empty, error, retry, and stale results while preserving the input that produced visible data. Keep a measured zero in the ready state. Independent operations need independent retry boundaries.
- Set `DataSection.loading` to a `ContentSkeleton` in the same `Grid` and `Stack` shape as the ready view. A known schema can shape placeholders, but loading must never show copied metrics as current data. A historical snapshot belongs in a separate dated view.

Inspect changed views at desktop and phone widths in both themes, including loading, empty, zero, error, and stale results.
