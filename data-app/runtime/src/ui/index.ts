// App shell and getting started
export { DataApp } from "./app/DataApp.tsx";
export type { DataAppProps } from "./app/DataApp.tsx";
export { GettingStarted } from "./app/GettingStarted.tsx";
export { AppLayout } from "./app/AppLayout.tsx";
export type { AppLayoutProps } from "./app/AppLayout.tsx";
export { AppHeader } from "./app/AppHeader.tsx";
export type { AppHeaderProps } from "./app/AppHeader.tsx";
export { AppScope } from "./app/AppScope.tsx";
export type { AppScopeProps } from "./app/AppScope.tsx";
export { AppToolbar } from "./app/AppToolbar.tsx";
export type { AppToolbarProps } from "./app/AppToolbar.tsx";
export { AppFooter } from "./app/AppFooter.tsx";
export type { AppFooterProps } from "./app/AppFooter.tsx";
export { ThemeSelector, ThemeToggle } from "./app/ThemeSelector.tsx";
export type { ThemeSelectorProps } from "./app/ThemeSelector.tsx";

// Layout
export { Stack } from "./layout/Stack.tsx";
export type { StackProps } from "./layout/Stack.tsx";
export { Grid } from "./layout/Grid.tsx";
export type { GridProps } from "./layout/Grid.tsx";
export { StorySection } from "./layout/StorySection.tsx";
export type { StorySectionProps } from "./layout/StorySection.tsx";

// Cards and visualizations
export type { CardEvidence } from "./cards/CardEvidence.ts";
export { VisualizationCard } from "./cards/VisualizationCard.tsx";
export type { VisualizationCardProps } from "./cards/VisualizationCard.tsx";
export { TableCard } from "./cards/TableCard.tsx";
export type { TableCardColumn, TableCardProps } from "./cards/TableCard.tsx";
export { Breakdown } from "./cards/Breakdown.tsx";
export type { BreakdownItem, BreakdownProps } from "./cards/Breakdown.tsx";
export { Ranking } from "./cards/Ranking.tsx";
export type { RankingItem, RankingProps } from "./cards/Ranking.tsx";
export { CardDisclosure } from "./cards/CardDisclosure.tsx";
export type { CardDisclosureProps } from "./cards/CardDisclosure.tsx";
export { CardViewTabs } from "./cards/CardViewTabs.tsx";
export type { CardView, CardViewTabsProps } from "./cards/CardViewTabs.tsx";
export { ComparisonVisual } from "./cards/ComparisonVisual.tsx";
export type { ComparisonVisualProps } from "./cards/ComparisonVisual.tsx";
export type { MetricComparison } from "./cards/comparison.ts";
export {
  DataTable,
  DataTableEmptyRow,
  DataTableTimestamp,
  DataTableShare,
} from "./cards/DataTable.tsx";
export type {
  DataTableProps,
  DataTableSearch,
  DataTableEmptyRowProps,
  DataTableTimestampProps,
} from "./cards/DataTable.tsx";
export { MetricCard } from "./cards/MetricCard.tsx";
export type { MetricCardProps } from "./cards/MetricCard.tsx";

// Request states and freshness
export { EmptyState } from "./requests/EmptyState.tsx";
export type { EmptyStateProps } from "./requests/EmptyState.tsx";
export { Skeleton } from "./requests/Skeleton.tsx";
export type { SkeletonProps } from "./requests/Skeleton.tsx";
export { DataBoundary } from "./requests/DataBoundary.tsx";
export { resolveDataView } from "./requests/DataBoundary.tsx";
export type { DataBoundaryProps, DataView, DataSnapshot } from "./requests/DataBoundary.tsx";
export { RefreshRegion } from "./requests/RefreshRegion.tsx";
export type { RefreshRegionProps } from "./requests/RefreshRegion.tsx";
export { DataSection } from "./requests/DataSection.tsx";
export type { DataSectionProps } from "./requests/DataSection.tsx";
export { StatusPanel } from "./requests/StatusPanel.tsx";
export type { StatusPanelProps } from "./requests/StatusPanel.tsx";
export { ContentSkeleton } from "./requests/ContentSkeleton.tsx";
export type { ContentSkeletonProps } from "./requests/ContentSkeleton.tsx";
export { DataViewToast } from "./requests/DataViewToast.tsx";
export type { DataViewToastProps } from "./requests/DataViewToast.tsx";
export { UpdatedAt } from "./requests/UpdatedAt.tsx";
export type { UpdatedAtProps } from "./requests/UpdatedAt.tsx";
export { DateTimeTooltip } from "./requests/DateTimeTooltip.tsx";
export type { DateTimeTooltipProps } from "./requests/DateTimeTooltip.tsx";

// Filters, URL state, and controls
export { LiveControl } from "./controls/LiveControl.tsx";
export type { LiveControlProps, LiveIntervalSeconds } from "./controls/LiveControl.tsx";
export { DateRangePicker } from "./controls/DateRangePicker.tsx";
export type { DatePresetId, DateRange, DateRangePickerProps } from "./controls/DateRangePicker.tsx";
export {
  defineAppVariables,
  textVariable,
  selectVariable,
  dateRangeVariable,
  dateRangeControl,
  useAppVariables,
} from "./controls/variables.ts";
export type {
  AppVariable,
  AppVariableValues,
  DateRangeSelection,
  DateRangeVariable,
  DateRangeVariableOptions,
} from "./controls/variables.ts";
export { PeriodSummary } from "./controls/PeriodSummary.tsx";
export type {
  ReportingPeriod,
  PeriodComparison,
  PeriodSummaryProps,
} from "./controls/PeriodSummary.tsx";
export { SearchField } from "./controls/SearchField.tsx";
export type { SearchFieldProps } from "./controls/SearchField.tsx";
export { searchItems } from "./controls/searchItems.ts";
export type {
  SearchAttribute,
  SearchHit,
  SearchItemsOptions,
  SearchMatchValue,
  SearchRange,
} from "./controls/searchItems.ts";
export { SearchMatch } from "./controls/SearchMatch.tsx";
export type { SearchMatchProps } from "./controls/SearchMatch.tsx";
export { Combobox } from "./controls/Combobox.tsx";
export type { ComboboxOption, ComboboxProps } from "./controls/Combobox.tsx";
export { searchParams, slug, subscribeSearch, writeSearch } from "./controls/search.ts";
export { Tabs, TabList, Tab, TabPanels, TabPanel, useViewTab } from "./controls/Tabs.tsx";

// Data context and query inspection
export type { DataContext, GlossaryEntry } from "./inspect/data-context.ts";
export type { DisclosedQuery } from "../contract.ts";
export { GlossaryExplanation } from "./inspect/GlossaryExplanation.tsx";
export type { GlossaryExplanationProps } from "./inspect/GlossaryExplanation.tsx";
export { AboutData } from "./inspect/AboutData.tsx";
export type { AboutDataProps, AboutSubject, AboutTab } from "./inspect/AboutData.tsx";

// Present mode
export { PlayStory } from "./presentation/PlayStory.tsx";
export type { PlayStoryProps, StoryStep } from "./presentation/PlayStory.tsx";

// Buttons, overlays, and icons
export { AppIcon } from "./primitives/icons.ts";
export type { AppIconName, AppIconProps } from "./primitives/icons.ts";
export { IconButton } from "./primitives/IconButton.tsx";
export type { IconButtonProps } from "./primitives/IconButton.tsx";
export { Kbd } from "./primitives/Kbd.tsx";
export type { KbdProps } from "./primitives/Kbd.tsx";
export { Sheet } from "./primitives/Sheet.tsx";
export type { SheetDialogProps, SheetProps } from "./primitives/Sheet.tsx";
export { Tooltip, TooltipProvider } from "./primitives/Tooltip.tsx";
export type { TooltipProps, TooltipProviderProps } from "./primitives/Tooltip.tsx";
export { Button } from "./primitives/Button.tsx";
export type { ButtonProps } from "./primitives/Button.tsx";
export { HelpPopover } from "./primitives/HelpPopover.tsx";
export type {
  HelpPopoverPanelProps,
  HelpPopoverProps,
  HelpPopoverTriggerProps,
} from "./primitives/HelpPopover.tsx";
