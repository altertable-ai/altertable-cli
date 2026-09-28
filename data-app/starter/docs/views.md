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
- Use `Breakdown` for parts of one total and `Ranking` for values compared with the largest visible item. Give numeric table columns their numeric type. Search the complete local collection before limiting rows, and render visible matches with `SearchMatch`.
- Use chart color by meaning: accent plus neutral for one series, stable distinct hues for categories, a lightness scale for ordered magnitude, and two ordered hues around a meaningful midpoint for signed change. Keep category colors consistent across views and themes. Mark notable values from data, not DOM position. Provide text labels and `Tooltip variant="chart"` on marks; touch must reveal the same information.
- Put stable glossary and query references in each card's `evidence`. Write the page as question, evidence, interpretation, and next question. Use `PlayStory` only for distinct observations a room can read from a distance; link relevant glossary terms and queries to each step. Conclude only when the data supports it.
- Pass `app.json`, `dataContext`, and a `useDataView` result as `request` to `DataApp`. Add optional filters and Present steps when the view needs them. For multiple operations, pass combined query evidence and refresh behavior explicitly. `DataApp` owns the page identity, theme control, About the data, and default toolbar. Keep the authored question and interpretation in its children. The generated `main.tsx` and `server.ts` already use `mountDataApp` and `serveLocalApp`; hosted servers must use `createDataHandler` with viewer authorization.
- Use the React-free parsers in `@altertable/data-app-runtime/contract` for empty input, bounded dates, counts, labels, and named query rows when they match the data contract. Define app-specific input and output validation in the operation. Never move source-specific SQL, populations, or metric definitions into shared runtime helpers.
- Set `app.json` title, scope, and appearance for the organization's brand. Keep the document title as `{app title} • {org}/{env} • Altertable app`. Use accessible controls and semantic icons. Essential actions must work without hover. The page must not overflow horizontally.

