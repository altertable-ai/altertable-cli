# Data authoring

Inspect catalogs, time coverage, and existing definitions before selecting the exploration. Explore several useful angles for broad requests. Use bounded queries and observed results.

| File | Owns |
| --- | --- |
| `app.json` | Title, verified scope, and appearance. |
| `src/operations.ts` | Bounded server-side queries, validation, and fixed live-check inputs. Credentials stay on the server. |
| `src/variables.ts` | Optional reader-controlled defaults, URL state, and operation inputs. |
| `src/data-context.ts` or `.tsx` | Exploration description, glossary, named queries, and optional source identifiers. |
| `src/App.tsx` | Questions, filters, result states, cards, and optional story. |

`defineOperation` requires input/output parsers, limits, and live-check inputs. For date comparisons, share a `defineDateRangeContract` between the browser variable and the operation's `input: calendar.parseRequest`. This is portable validation; deployment adapters can reuse it without the local server. Query `input.range` and `input.comparison` when present.

Use one `defineQueryNames` registry in `defineOperation({ queryNames, ... })` and `createDataContext(queryNames)`. The operation validates returned query names; the context types glossary entries, card evidence, and Present steps through `context.storyStep`. Register physical source names with `defineDataIdentifiers`; prose uses `<DataIdentifier id="tables.events" />`. The [runtime guide](../.altertable/runtime/README.md#bind-evidence) shows the complete pattern.

Prefer a source-bounded date variable for ongoing questions. Fixed periods belong to deliberate historical explorations. SQL and business definitions remain app-owned. `app dev` and `app check --lakehouse` reject mismatches with known profile scope; app checks also reject browser value imports of the server entry, operations, or runtime server adapters.

Environment-only credentials may not identify an organization. Verify source identity during discovery when that metadata is unavailable.
