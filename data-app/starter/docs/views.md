# View authoring

[Runtime API map](../.altertable/runtime/README.md#find-ui-by-task) routes views, controls, widgets, and Story to their source contracts. Start with `DataApp` and `createDataHooks`; use the shared widgets and controls for standard interactions.

Choose useful dimensions and verify the source meaning of their values. The app defines emptiness: a measured zero and unavailable data have different meanings.

Include Story when the data supports consequential, evidence-backed findings. Prefer a concentration, split, shift, or meaningful co-occurrence over repeated KPIs. Omit Story when there is no defensible finding, and describe association without claiming causation.

Check the finished app against live data at phone and desktop widths in both themes.

Use bound widget readings for initial skeletons. For retained results, pass the widget’s `status` (`updating`, `error` with `onRetry`, or `idle`) instead of app-owned loading or failure markup. Pickers own their progress hint and adjacent retry slot; keep known options mounted during refresh.
