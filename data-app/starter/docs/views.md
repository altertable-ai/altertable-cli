# View authoring

Use `DataApp` for the title, description, scope, controls, and request boundary. Body content begins with the exploration. A second top-level heading triggers a development warning. `AppLayout` owns the outer gutter and page width.

For time-based data, use `defineTimeView({ operation, time: { contract, defaultValue }, isEmpty, empty })`. The view generates the URL-backed date picker, operation input, and displayed-period label. For an intentional fixed reporting period, use `defineDataView` with `describeInput`.

Give most data apps a `story={({ data, input, state }) => [...]}` callback. Present uses the displayed snapshot, including the original input during refresh or failure. Author one to four consequential findings with stable IDs, evidence, and a comparative or relational visual. Prefer a concentration, split, shift, or meaningful co-occurrence over a repeated KPI. State that association is not causation where relevant. Each finding needs `evidence: context.evidence(...)` or a bound metric.

Use `SelectableBarChart` when selecting a bar inspects a related detail. It handles exact value preview, keyboard navigation, persistent selection, and clearing. Keep the detail view tied to its controlled `selectedId`.

[Runtime API map](../.altertable/runtime/README.md#find-ui-by-task) lists the other components. A measured zero and unavailable data have different meanings; the app defines whether a result is empty. Check the finished app with live data at phone and desktop widths.

For a categorical source dimension, define a `dimensionFilter` with fixed options or a typed `defineFacetFilter` operation, then pass it to `defineTimeView({ filters: { interface: filter }, ... })` or `defineDataView({ filters: ... })`. The operation input parser calls `parseDimensionSelection`, and its SQL uses `dimensionPredicate` for the allowlisted source column. All, a literal value named `null`, and missing are distinct. Choose useful dimensions and verify the source meaning of each value.
