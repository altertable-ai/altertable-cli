# Data authoring

Confirm that the connected profile matches `app.json` scope. Inspect catalogs, tables, time coverage, and existing definitions through Altertable MCP or the CLI. Validate bounded queries before putting them in `src/operations.ts`. For broad requests, inspect distinct angles such as activity over time, feature reach, and organization usage before deciding what the app should show. A successful first query proves the connection; it does not establish the exploration's coverage.

Replace the starter connection operation with app-specific operations. Define bounded parsers and policy with `defineOperation`, and include fixed valid `checks` for `altertable app check --lakehouse`. Use `defineDateRangeContract` when a query takes a calendar range; its parser, URL variable bounds, and displayed period share one policy. Check that the connected organization and environment match `app.json` before running queries. Never invent data or treat an observed association as a proven cause.

| File | Owns |
| --- | --- |
| `app.json` | Title, verified scope, and appearance. |
| `src/operations.ts` | Bounded server-side queries, validation, and fixed live-check inputs. Credentials stay on the server. |
| `src/variables.ts` | Optional reader-controlled defaults, URL state, and operation inputs. |
| `src/data-context.ts` or `.tsx` | Exploration description, glossary, named queries, and optional source identifiers. |
| `src/App.tsx` | Questions, filters, result states, cards, and optional story. |

Write the reader's context and glossary with `defineDataContext`. If cards cite named SQL, register names with `defineQueryNames` and check references with `evidenceFor(dataContext, queryNames)`. Source-specific SQL and metric definitions belong in this app. See the [runtime API map](../.altertable/runtime/README.md) for the exact types.

When prose names a table or column, register its exact catalog, schema, table, and column once in `src/data-context.tsx`:

```tsx
import { defineDataIdentifiers, type DataContext } from "@altertable/data-app-runtime/ui";

const identifiers = defineDataIdentifiers({
  tables: { events: { catalog: "product_analytics", schema: "analytics", name: "events" } },
  columns: { identityUuid: { table: "events", name: "identity_uuid" } },
});
const { DataIdentifier } = identifiers;
export const dataContext = {
  identifiers: identifiers.definitions,
  description: <>Explore <DataIdentifier id="tables.events" />.</>,
  glossary: {
    people: {
      term: "Tracked people",
      definition: <>Distinct <DataIdentifier id="columns.events.identityUuid" /> values.</>,
    },
  },
} satisfies DataContext;
```

Import `defineDataIdentifiers` and `DataContext` from `/ui`. Plain strings remain valid when no source name appears. IDs are local aliases; the registry owns physical names, and aliases cannot contain periods. Do not parse prose for identifiers or use rendered names to construct SQL.

Prefer a dynamic, source-bounded date range for ongoing questions. Bind controls to `useAppVariables` values so URL state, reset, and Back/Forward work. Keep local search out of operation inputs. Use a fixed period only for a deliberate historical snapshot or rolling sub-day question; explain that choice in the data context.

For comparisons, set `comparison: true` on `dateRangeVariable`, pass `dateRangeControl` to `DateRangePicker`, and use `variable.comparisonRange(selection)` to get the preceding equal-length range only when the reader selected it. It returns `null` when comparison is off or source coverage is insufficient. When present, send both ranges to the operation and query each on the server; keep the displayed comparison tied to the result that produced it.

After changing operations or inputs, run `altertable app check --lakehouse` with the matching profile. It executes the operations' declared checks; keep them aligned with their input parsers. Inspect the rendered app at phone and desktop widths, including loading, empty, error, and stale results.
