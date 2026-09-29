# View authoring

Lead with a supported finding, its evidence, and a complementary question. Keep copy specific to the result. Use `Stack` for sections and `Grid` for peer cards. The runtime owns responsive gaps, wrapping, and typography; `GridItem` adds intentional spans.

Use `createDataHooks(client).defineDataView` to declare variables, operation inputs, and emptiness once. A view with one date variable and a `DateRangeRequest` inherits its displayed label from the date contract; other views supply `describeInput`. `useView(definition)` supplies the request and controls to `DataApp`. See the [complete binding example](../.altertable/runtime/README.md#bind-a-view).

Use `defineDataContent` when loading and ready states should share a layout. Its loading state has no result values. Numeric `MetricCard` values require a format; custom readings use `content`. `calendarMetricComparison(displayedInput, values)` labels a previous-period comparison from the visible result. Pass `null` when the previous value is unavailable; `0` is a measured zero. `DataApp` has default empty inspection tabs, while `CardViewTabs` requires each tab's empty state.

The [runtime API map](../.altertable/runtime/README.md#find-ui-by-task) routes charts, evidence, context, and Present mode to their types. Check the app's actual content at phone and desktop widths in both themes.
