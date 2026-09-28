# View authoring

Lead with the strongest supported finding, then show the evidence and a complementary question. Use `DataApp` for the primary `useDataView` result and `DataSection` for independent requests. The shell owns refresh state, toast, dimming, and About the data. Use `evidenceFor(dataContext)` to check glossary IDs while authoring cards.

Use `Stack` for consecutive sections and `Grid` for peer cards; make the primary visual wider when the reading order calls for it. Cards can render their own loading skeletons. `TableCard` searches the full row collection before applying a display limit. Use `Breakdown` for parts of one total and `Ranking` for comparison with the largest visible value.

Keep copy specific to the current result. Make marks readable in text and usable by touch. Check the rendered app at phone and desktop widths in both themes. The [UI API map](../.altertable/runtime/README.md#find-ui-by-task) links components and types.
