# How people use Altertable

A local data app for selected product actions from August 29 through September 28, 2026 (UTC). It queries `product_analytics.analytics.events` in the `altertable/production` lakehouse and shows a labeled snapshot from the same query when live access is unavailable.

## Run

```fish
altertable app dev
```

Open the URL printed by the CLI. The selected Altertable profile must have lakehouse access for live refresh. To check the source operation:

```fish
altertable app check --lakehouse
```

The period is intentionally fixed so the live query and dated fallback describe the same window. The snapshot was collected September 28, 2026; replace it after changing the SQL or period.

## Reading the numbers

The app counts eight instrumented feature events at organizations whose `organization_slug` is present and differs from `altertable`. Marketing pageviews and scroll events are outside this view. Feature action counts include repeats, while tracked people count distinct `identity_uuid` values. Per-feature identity counts overlap. Other organization slugs may still represent demos or internal activity. The app does not claim complete usage coverage or infer successful outcomes from view events.

SQL and validation live in `src/operations.ts`; the exploration context and definitions live in `src/data-context.ts`. The generated `.altertable/runtime/` is a versioned local package and must be committed with the app.
