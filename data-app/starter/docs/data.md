# Data authoring

Inspect catalogs, time coverage, and existing definitions before selecting the exploration. Explore several useful angles for broad requests. Use bounded queries and observed results.

| File | Owns |
| --- | --- |
| `app.json` | Title, verified scope, and appearance. |
| `queries.json` | The server-owned map of query IDs to SQL templates. |
| `variables.json` | Named variable definitions with required type, nullable, and default fields. |
| `src/operations.ts` | Browser-owned operations calling query IDs with values, parsing, and fixed live-check inputs. |
| `src/variables.ts` | Optional reader-controlled defaults, URL state, and operation inputs. |
| `src/data-context.ts` or `.tsx` | Exploration description, glossary, named queries, and optional source identifiers. |
| `src/App.tsx` | Questions, filters, result states, cards, and optional story. |

[Execute named queries](../node_modules/@altertable/data-app/docs/contract.md) and [bind evidence](../node_modules/@altertable/data-app/docs/react.md#bind-evidence) using the runtime contracts. Prefer a date variable for ongoing questions; choose a fixed period for deliberate historical explorations.

`app check --lakehouse` verifies declared operations and known profile scope. Environment-only credentials may not identify an organization; verify source identity during discovery when that metadata is unavailable.

Use `createDataClient({ operations })` and `query(id, values)` in the iframe. Keep SQL out of browser imports; the Bun host validates registration and uses the CLI HTTP proxy.
