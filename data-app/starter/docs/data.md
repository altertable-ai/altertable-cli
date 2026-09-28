# Data and operation authoring

Runtime contracts and entry points: [API map](../.altertable/runtime/README.md#entry-points).


1. Read `app.json` and confirm its organization and environment against the connected source and `altertable profile show --json`. A starter created with `--without-profile` has placeholders; resolve them before querying. If the scopes differ, stop and show both. Offer `altertable profile switch <name>` for a matching profile or `altertable login --org <org> --env <env>` to connect the intended one.
2. Use the [Altertable MCP](https://altertable.ai/docs/query-data/mcp) to inspect catalogs, tables, columns, and existing definitions. If it is disconnected, ask to connect it; use `altertable catalogs` and `altertable query` if connection fails or the user declines. The app never calls MCP at runtime.
3. Write a description of what the reader is exploring and why, and define a glossary of terms in `src/data-context.ts`. Make the description specific to the operation's SQL and its coverage. Validate one bounded query in the intended environment, then implement it with input and output parsers in `src/operations.ts`.
4. Show the first useful result and its interpretation in `src/App.tsx` before adding more questions. Build optional Present steps from the loaded result. Never invent data or treat an observed association as a proven cause.

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

