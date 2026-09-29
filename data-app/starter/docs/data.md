# Data authoring

Inspect catalogs, time coverage, and existing definitions before selecting the exploration. Explore several useful angles for broad requests. Use bounded queries and observed results.

| File | Owns |
| --- | --- |
| `app.json` | Title, verified scope, and appearance. |
| `src/operations.ts` | Bounded server-side queries, validation, and fixed live-check inputs. Credentials stay on the server. |
| `src/variables.ts` | Optional reader-controlled defaults, URL state, and operation inputs. |
| `src/data-context.ts` or `.tsx` | Exploration description, glossary, named queries, and optional source identifiers. |
| `src/App.tsx` | Questions, filters, result states, cards, and optional story. |

[Execute named queries](../.altertable/runtime/README.md#execute-named-queries) and [bind evidence](../.altertable/runtime/README.md#bind-evidence) using the runtime contracts. Prefer a date variable for ongoing questions; choose a fixed period for deliberate historical explorations.

`app check --lakehouse` verifies declared operations and known profile scope. Environment-only credentials may not identify an organization; verify source identity during discovery when that metadata is unavailable.
