// App shell and getting started
export { DataApp } from "./DataApp.tsx";
export type { DataAppProps, DataAppRequest } from "./DataApp.tsx";
export { GettingStarted } from "./GettingStarted.tsx";
export { AppLayout } from "./AppLayout.tsx";
export type { AppLayoutProps } from "./AppLayout.tsx";
export { AppHeader } from "./AppHeader.tsx";
export type { AppHeaderProps } from "./AppHeader.tsx";
export { AppScope } from "./AppScope.tsx";
export type { AppScopeProps } from "./AppScope.tsx";
export { AppToolbar } from "./AppToolbar.tsx";
export type { AppToolbarProps } from "./AppToolbar.tsx";
export { VariableBar } from "./VariableBar.tsx";
export type { VariableBarProps } from "./VariableBar.tsx";
export { AppFooter } from "./AppFooter.tsx";
export type { AppFooterProps } from "./AppFooter.tsx";
export { ThemeSelector, ThemeToggle } from "./ThemeSelector.tsx";
export type { ThemeSelectorProps } from "./ThemeSelector.tsx";

// Layout
export { Stack } from "./Stack.tsx";
export type { StackProps } from "./Stack.tsx";
export { Grid } from "./Grid.tsx";
export type { GridProps } from "./Grid.tsx";
export { GridItem } from "./GridItem.tsx";
export type { GridItemProps } from "./GridItem.tsx";
export { StorySection } from "./StorySection.tsx";
export type { StorySectionProps } from "./StorySection.tsx";

// Cards and visualizations
export type { CardEvidence } from "./CardEvidence.ts";
export { VisualizationCard } from "./VisualizationCard.tsx";
export type { VisualizationCardProps } from "./VisualizationCard.tsx";
export { TableCard } from "./TableCard.tsx";
export type { TableCardColumn, TableCardProps, TableCardSearch } from "./TableCard.tsx";
export { chartColor } from "./chartColor.ts";
export { Breakdown } from "./Breakdown.tsx";
export type { BreakdownItem, BreakdownProps } from "./Breakdown.tsx";
export { Ranking } from "./Ranking.tsx";
export type { RankingItem, RankingProps } from "./Ranking.tsx";
export { CardDisclosure } from "./CardDisclosure.tsx";
export type { CardDisclosureProps } from "./CardDisclosure.tsx";
export { CardViewTabs } from "./CardViewTabs.tsx";
export type { CardView, CardViewTabsProps } from "./CardViewTabs.tsx";
export { ComparisonVisual } from "./ComparisonVisual.tsx";
export type { ComparisonVisualProps } from "./ComparisonVisual.tsx";
export type { MetricComparison } from "./comparison.ts";
export { DataTable, DataTableEmptyRow, DataTableTimestamp, DataTableShare } from "./DataTable.tsx";
export type {
  DataTableProps,
  DataTableSearch,
  DataTableEmptyRowProps,
  DataTableTimestampProps,
} from "./DataTable.tsx";
export { MetricCard } from "./MetricCard.tsx";
export type { MetricCardProps } from "./MetricCard.tsx";

// Request states and freshness
export { EmptyState } from "./EmptyState.tsx";
export type { EmptyStateProps } from "./EmptyState.tsx";
export { Skeleton } from "./Skeleton.tsx";
export type { SkeletonProps } from "./Skeleton.tsx";
export { DataBoundary } from "./DataBoundary.tsx";
export { resolveDataView } from "./DataBoundary.tsx";
export type { DataBoundaryProps, DataView, DataSnapshot } from "./DataBoundary.tsx";
export { RefreshRegion } from "./RefreshRegion.tsx";
export type { RefreshRegionProps } from "./RefreshRegion.tsx";
export { DataSection } from "./DataSection.tsx";
export type { DataSectionProps } from "./DataSection.tsx";
export { StatusPanel } from "./StatusPanel.tsx";
export type { StatusPanelProps } from "./StatusPanel.tsx";
export { ContentSkeleton } from "./ContentSkeleton.tsx";
export type { ContentSkeletonProps } from "./ContentSkeleton.tsx";
export { DataViewToast } from "./DataViewToast.tsx";
export type { DataViewToastProps } from "./DataViewToast.tsx";
export { UpdatedAt } from "./UpdatedAt.tsx";
export type { UpdatedAtProps } from "./UpdatedAt.tsx";
export { DateTimeTooltip } from "./DateTimeTooltip.tsx";
export type { DateTimeTooltipProps } from "./DateTimeTooltip.tsx";

// Filters, URL state, and controls
export { LiveControl } from "./LiveControl.tsx";
export type { LiveControlProps, LiveIntervalSeconds } from "./LiveControl.tsx";
export { DateRangePicker } from "./DateRangePicker.tsx";
export type { DatePresetId, DateRange, DateRangePickerProps } from "./DateRangePicker.tsx";
export {
  defineAppVariables,
  textVariable,
  selectVariable,
  dateRangeVariable,
  dateRangeControl,
  useAppVariables,
} from "./variables.ts";
export type {
  AppVariable,
  AppVariableValues,
  DateRangeSelection,
  DateRangeVariable,
  DateRangeVariableOptions,
} from "./variables.ts";
export { PeriodSummary } from "./PeriodSummary.tsx";
export type { ReportingPeriod, PeriodComparison, PeriodSummaryProps } from "./PeriodSummary.tsx";
export { SearchField } from "./SearchField.tsx";
export type { SearchFieldProps } from "./SearchField.tsx";
export { searchItems } from "./searchItems.ts";
export type {
  SearchAttribute,
  SearchHit,
  SearchItemsOptions,
  SearchMatchValue,
  SearchRange,
} from "./searchItems.ts";
export { SearchMatch } from "./SearchMatch.tsx";
export type { SearchMatchProps } from "./SearchMatch.tsx";
export { Combobox } from "./Combobox.tsx";
export type { ComboboxOption, ComboboxProps } from "./Combobox.tsx";
export { searchParams, slug, subscribeSearch, writeSearch } from "./search.ts";
export { Tabs, TabList, Tab, TabPanels, TabPanel, useViewTab } from "./Tabs.tsx";

// Data context and query inspection
export { createDataContext, defineDataContext, evidenceFor } from "./data-context.ts";
export type { DataContext, GlossaryEntry } from "./data-context.ts";
export { defineDataIdentifiers } from "./data-identifiers.tsx";
export type {
  DataIdentifierDefinition,
  TableIdentifier,
  ColumnIdentifier,
} from "./data-identifiers.tsx";
export type { DisclosedQuery } from "../contract.ts";
export { GlossaryExplanation } from "./GlossaryExplanation.tsx";
export type { GlossaryExplanationProps } from "./GlossaryExplanation.tsx";
export { GlossaryDefinition } from "./GlossaryDefinition.tsx";
export type { GlossaryDefinitionProps } from "./GlossaryDefinition.tsx";
export { AboutData } from "./AboutData.tsx";
export type { AboutDataProps, AboutEmpty, AboutSubject, AboutTab } from "./AboutData.tsx";

// Present mode
export { PlayStory } from "./PlayStory.tsx";
export type { PlayStoryProps, StoryStep } from "./PlayStory.tsx";

// Buttons, overlays, and icons
export { AppIcon } from "./icons.ts";
export type { AppIconName, AppIconProps } from "./icons.ts";
export { IconButton } from "./IconButton.tsx";
export type { IconButtonProps } from "./IconButton.tsx";
export { Kbd } from "./Kbd.tsx";
export type { KbdProps } from "./Kbd.tsx";
export { Sheet } from "./Sheet.tsx";
export type { SheetDialogProps, SheetProps } from "./Sheet.tsx";
export { Tooltip, TooltipProvider } from "./Tooltip.tsx";
export type { TooltipProps, TooltipProviderProps } from "./Tooltip.tsx";
export { Button } from "./Button.tsx";
export type { ButtonProps } from "./Button.tsx";
export { HelpPopover } from "./HelpPopover.tsx";
export type {
  HelpPopoverPanelProps,
  HelpPopoverProps,
  HelpPopoverTriggerProps,
} from "./HelpPopover.tsx";
