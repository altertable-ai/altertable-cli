# Data authoring

Inspect catalogs, time coverage, and existing definitions before selecting the exploration. Explore several useful angles for broad requests. Use bounded queries and observed results.

| File | Owns |
| --- | --- |
| `app.json` | Title, verified scope, and appearance. |
| `src/operations.ts` | Bounded server-side queries, validation, and fixed live-check inputs. Credentials stay on the server. |
| `src/variables.ts` | Optional reader-controlled defaults, URL state, and operation inputs. |
| `src/data-context.tsx` | Exploration description, glossary, named queries, and registered physical source identifiers. |
| `src/App.tsx` | Questions, filters, result states, cards, and bound Present findings. |

[Execute named queries](../.altertable/runtime/README.md#execute-named-queries) and [bind evidence](../.altertable/runtime/README.md#bind-evidence) using the runtime contracts. For an operation whose input is a `DateRangeRequest`, `defineTimeView` derives the URL variable, picker, operation input, and displayed period from one `time` declaration. Use `defineDataView` with an explicit `describeInput` for a deliberate fixed-period exploration. When descriptions or glossary definitions name physical tables or columns, register them with `defineDataIdentifiers` and render `<DataIdentifier>` in JSX.

`app check --lakehouse` verifies declared operations and known profile scope. Environment-only credentials may not identify an organization; verify source identity during discovery when that metadata is unavailable.
