# Data and operation authoring

Runtime contracts and entry points: [API map](../.altertable/runtime/README.md#entry-points).

1. Read `app.json` and confirm its organization and environment against the connected source and `altertable profile show --json`. A starter created with `--without-profile` has placeholders; resolve them before querying. If the scopes differ, stop and show both. Offer `altertable profile switch <name>` for a matching profile or `altertable login --org <org> --env <env>` to connect the intended one.
2. Inspect catalogs, tables, columns, and existing definitions through an available [Altertable MCP](https://altertable.ai/docs/query-data/mcp) connection or `altertable catalogs` and `altertable query`. Use whichever already has access to the intended source; ask for connection help only when neither can access it. The app never calls MCP at runtime.
3. Write a description of what the reader is exploring and why, and define a glossary of terms in `src/data-context.ts`. Make the description specific to the operation's SQL and its coverage. Replace the setup description, `connectionVerified` glossary entry, and `connection-check` query references with context and definitions for the actual exploration.
4. Validate one bounded query in the intended environment, then replace the starter connection operation with it and its input and output parsers in `src/operations.ts`. Update `app.json.operations` in the same change: remove the `connection` fixture and declare fixed valid inputs under the new operation names.
5. Replace `<GettingStarted />` in `src/App.tsx` with the first useful result and its interpretation inside `<DataApp />`; follow the [view guide](views.md) before adding more questions. Never invent data or treat an observed association as a proven cause.

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
- Use the React-free parsers in `@altertable/data-app-runtime/contract` for empty input, bounded dates, counts, labels, and named query rows when they match the data contract. Define app-specific input and output validation in the operation. Never move source-specific SQL, populations, or metric definitions into shared runtime helpers.

After changing operations or inputs, run `altertable app check --lakehouse` with the matching profile. It executes the fixed `app.json.operations` fixtures; keep them aligned with the exported operations and their input parsers.
