# View authoring

Lead with a supported finding, its evidence, and a complementary question. Keep copy specific to the result. Use `Stack` for sections and `Grid` for peer cards. The runtime owns responsive gaps, wrapping, and typography; `GridItem` adds intentional spans.

Use `createDataHooks(client).defineDataView` to declare variables, operation inputs, emptiness, and input labels once. `useView(definition)` supplies the request and controls to `DataApp`. See the [complete binding example](../.altertable/runtime/README.md#bind-a-view).

Use `defineDataContent` when loading and ready states should share a layout. Its loading state has no result values. Numeric `MetricCard` values require a format; custom readings use `content`. `CardViewTabs` requires each tab's empty state.

The [runtime API map](../.altertable/runtime/README.md#find-ui-by-task) routes charts, evidence, context, and Present mode to their types. Check the app's actual content at phone and desktop widths in both themes.
