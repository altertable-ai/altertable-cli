import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigurationError } from "@/lib/errors.ts";
import runtimePackage from "@/commands/app/templates/runtime/package.json.txt";
import runtimeServer from "@/commands/app/templates/runtime/server.ts.txt";
import runtimeReact from "@/commands/app/templates/runtime/react.tsx.txt";
import runtimeContract from "@/commands/app/templates/runtime/contract.ts.txt";
import runtimeLocal from "@/commands/app/templates/runtime/local.ts.txt";
import runtimeClient from "@/commands/app/templates/runtime/client.ts.txt";
import runtimeFormat from "@/commands/app/templates/runtime/format.ts.txt";
import runtimeAppearance from "@/commands/app/templates/runtime/appearance.ts.txt";
import runtimeUiIndex from "@/commands/app/templates/runtime/ui/index.ts.txt";
import runtimeClassNames from "@/commands/app/templates/runtime/ui/classNames.ts.txt";
import runtimeShortcuts from "@/commands/app/templates/runtime/ui/shortcuts.ts.txt";
import runtimeSearch from "@/commands/app/templates/runtime/ui/search.ts.txt";
import runtimeDataContext from "@/commands/app/templates/runtime/ui/data-context.ts.txt";
import runtimeAboutData from "@/commands/app/templates/runtime/ui/AboutData.tsx.txt";
import runtimeAboutDataStyles from "@/commands/app/templates/runtime/ui/AboutData.css.txt";
import runtimeSheet from "@/commands/app/templates/runtime/ui/Sheet.tsx.txt";
import runtimeSheetStyles from "@/commands/app/templates/runtime/ui/Sheet.css.txt";
import runtimeGlossaryExplanation from "@/commands/app/templates/runtime/ui/GlossaryExplanation.tsx.txt";
import runtimeInspectStyles from "@/commands/app/templates/runtime/ui/Inspect.css.txt";
import runtimeHelpPopover from "@/commands/app/templates/runtime/ui/HelpPopover.tsx.txt";
import runtimeHelpPopoverStyles from "@/commands/app/templates/runtime/ui/HelpPopover.css.txt";
import runtimeTooltip from "@/commands/app/templates/runtime/ui/Tooltip.tsx.txt";
import runtimeTooltipStyles from "@/commands/app/templates/runtime/ui/Tooltip.css.txt";
import runtimeDateTimeTooltip from "@/commands/app/templates/runtime/ui/DateTimeTooltip.tsx.txt";
import runtimeDateTimeTooltipStyles from "@/commands/app/templates/runtime/ui/DateTimeTooltip.css.txt";
import runtimeSearchField from "@/commands/app/templates/runtime/ui/SearchField.tsx.txt";
import runtimeSearchFieldStyles from "@/commands/app/templates/runtime/ui/SearchField.css.txt";
import runtimeSearchItems from "@/commands/app/templates/runtime/ui/searchItems.ts.txt";
import runtimeSearchMatch from "@/commands/app/templates/runtime/ui/SearchMatch.tsx.txt";
import runtimeSearchMatchStyles from "@/commands/app/templates/runtime/ui/SearchMatch.css.txt";
import runtimeCombobox from "@/commands/app/templates/runtime/ui/Combobox.tsx.txt";
import runtimeComboboxStyles from "@/commands/app/templates/runtime/ui/Combobox.css.txt";
import runtimeDataBoundary from "@/commands/app/templates/runtime/ui/DataBoundary.tsx.txt";
import runtimeDataBoundaryStyles from "@/commands/app/templates/runtime/ui/DataBoundary.css.txt";
import runtimeDataViewToast from "@/commands/app/templates/runtime/ui/DataViewToast.tsx.txt";
import runtimeDataViewToastStyles from "@/commands/app/templates/runtime/ui/DataViewToast.css.txt";
import runtimeContentSkeleton from "@/commands/app/templates/runtime/ui/ContentSkeleton.tsx.txt";
import runtimeContentSkeletonStyles from "@/commands/app/templates/runtime/ui/ContentSkeleton.css.txt";
import runtimeUpdatedAt from "@/commands/app/templates/runtime/ui/UpdatedAt.tsx.txt";
import runtimeUpdatedAtStyles from "@/commands/app/templates/runtime/ui/UpdatedAt.css.txt";
import runtimeRefreshRegion from "@/commands/app/templates/runtime/ui/RefreshRegion.tsx.txt";
import runtimeRefreshRegionStyles from "@/commands/app/templates/runtime/ui/RefreshRegion.css.txt";
import runtimeRefreshControl from "@/commands/app/templates/runtime/ui/RefreshControl.tsx.txt";
import runtimeRefreshControlStyles from "@/commands/app/templates/runtime/ui/RefreshControl.css.txt";
import runtimeQueryList from "@/commands/app/templates/runtime/ui/QueryList.tsx.txt";
import runtimeQueryListStyles from "@/commands/app/templates/runtime/ui/QueryList.css.txt";
import runtimeIcons from "@/commands/app/templates/runtime/ui/icons.ts.txt";
import runtimeThemeSelector from "@/commands/app/templates/runtime/ui/ThemeSelector.tsx.txt";
import runtimeThemeStyles from "@/commands/app/templates/runtime/ui/ThemeSelector.css.txt";
import runtimeFooter from "@/commands/app/templates/runtime/ui/AppFooter.tsx.txt";
import runtimeFooterStyles from "@/commands/app/templates/runtime/ui/AppFooter.css.txt";
import runtimeAltertableLogo from "@/commands/app/templates/runtime/ui/AltertableLogo.tsx.txt";
import runtimeAppLayout from "@/commands/app/templates/runtime/ui/AppLayout.tsx.txt";
import runtimeAppLayoutStyles from "@/commands/app/templates/runtime/ui/AppLayout.css.txt";
import runtimeStack from "@/commands/app/templates/runtime/ui/Stack.tsx.txt";
import runtimeStackStyles from "@/commands/app/templates/runtime/ui/Stack.css.txt";
import runtimeGrid from "@/commands/app/templates/runtime/ui/Grid.tsx.txt";
import runtimeGridStyles from "@/commands/app/templates/runtime/ui/Grid.css.txt";
import runtimeStorySection from "@/commands/app/templates/runtime/ui/StorySection.tsx.txt";
import runtimeStorySectionStyles from "@/commands/app/templates/runtime/ui/StorySection.css.txt";
import runtimeAppHeader from "@/commands/app/templates/runtime/ui/AppHeader.tsx.txt";
import runtimeAppHeaderStyles from "@/commands/app/templates/runtime/ui/AppHeader.css.txt";
import runtimeAppToolbar from "@/commands/app/templates/runtime/ui/AppToolbar.tsx.txt";
import runtimeAppToolbarStyles from "@/commands/app/templates/runtime/ui/AppToolbar.css.txt";
import runtimeAppScope from "@/commands/app/templates/runtime/ui/AppScope.tsx.txt";
import runtimeAppScopeStyles from "@/commands/app/templates/runtime/ui/AppScope.css.txt";
import runtimeButton from "@/commands/app/templates/runtime/ui/Button.tsx.txt";
import runtimeButtonStyles from "@/commands/app/templates/runtime/ui/Button.css.txt";
import runtimeIconButton from "@/commands/app/templates/runtime/ui/IconButton.tsx.txt";
import runtimeKbd from "@/commands/app/templates/runtime/ui/Kbd.tsx.txt";
import runtimeKbdStyles from "@/commands/app/templates/runtime/ui/Kbd.css.txt";
import runtimeMetricCard from "@/commands/app/templates/runtime/ui/MetricCard.tsx.txt";
import runtimeMetricCardStyles from "@/commands/app/templates/runtime/ui/MetricCard.css.txt";
import runtimeCardEvidence from "@/commands/app/templates/runtime/ui/CardEvidence.ts.txt";
import runtimeVisualizationCard from "@/commands/app/templates/runtime/ui/VisualizationCard.tsx.txt";
import runtimeVisualizationCardStyles from "@/commands/app/templates/runtime/ui/VisualizationCard.css.txt";
import runtimeTableCard from "@/commands/app/templates/runtime/ui/TableCard.tsx.txt";
import runtimeTableCardStyles from "@/commands/app/templates/runtime/ui/TableCard.css.txt";
import runtimeDataSection from "@/commands/app/templates/runtime/ui/DataSection.tsx.txt";
import runtimeBreakdown from "@/commands/app/templates/runtime/ui/Breakdown.tsx.txt";
import runtimeBreakdownStyles from "@/commands/app/templates/runtime/ui/Breakdown.css.txt";
import runtimeRanking from "@/commands/app/templates/runtime/ui/Ranking.tsx.txt";
import runtimeRankingStyles from "@/commands/app/templates/runtime/ui/Ranking.css.txt";
import runtimeComparison from "@/commands/app/templates/runtime/ui/comparison.ts.txt";
import runtimeDataPanel from "@/commands/app/templates/runtime/ui/DataPanel.tsx.txt";
import runtimeDataPanelStyles from "@/commands/app/templates/runtime/ui/DataPanel.css.txt";
import runtimeEmptyState from "@/commands/app/templates/runtime/ui/EmptyState.tsx.txt";
import runtimeEmptyStateStyles from "@/commands/app/templates/runtime/ui/EmptyState.css.txt";
import runtimeCardDisclosure from "@/commands/app/templates/runtime/ui/CardDisclosure.tsx.txt";
import runtimeCardDisclosureStyles from "@/commands/app/templates/runtime/ui/CardDisclosure.css.txt";
import runtimeCardViewTabs from "@/commands/app/templates/runtime/ui/CardViewTabs.tsx.txt";
import runtimeCardViewTabsStyles from "@/commands/app/templates/runtime/ui/CardViewTabs.css.txt";
import runtimeLiveControl from "@/commands/app/templates/runtime/ui/LiveControl.tsx.txt";
import runtimeLiveControlStyles from "@/commands/app/templates/runtime/ui/LiveControl.css.txt";
import runtimeComparisonVisual from "@/commands/app/templates/runtime/ui/ComparisonVisual.tsx.txt";
import runtimeComparisonVisualStyles from "@/commands/app/templates/runtime/ui/ComparisonVisual.css.txt";
import runtimeDataTable from "@/commands/app/templates/runtime/ui/DataTable.tsx.txt";
import runtimeDataTableStyles from "@/commands/app/templates/runtime/ui/DataTable.css.txt";
import runtimeStatusPanel from "@/commands/app/templates/runtime/ui/StatusPanel.tsx.txt";
import runtimeStatusPanelStyles from "@/commands/app/templates/runtime/ui/StatusPanel.css.txt";
import runtimeSkeleton from "@/commands/app/templates/runtime/ui/Skeleton.tsx.txt";
import runtimeSkeletonStyles from "@/commands/app/templates/runtime/ui/Skeleton.css.txt";
import runtimePlayStory from "@/commands/app/templates/runtime/ui/PlayStory.tsx.txt";
import runtimePlayStoryStyles from "@/commands/app/templates/runtime/ui/PlayStory.css.txt";
import runtimeTabs from "@/commands/app/templates/runtime/ui/Tabs.tsx.txt";
import runtimeTabsStyles from "@/commands/app/templates/runtime/ui/Tabs.css.txt";
import runtimeDateRangePicker from "@/commands/app/templates/runtime/ui/DateRangePicker.tsx.txt";
import runtimeDateRangePickerStyles from "@/commands/app/templates/runtime/ui/DateRangePicker.css.txt";
import runtimeVariables from "@/commands/app/templates/runtime/ui/variables.ts.txt";
import runtimePeriodSummary from "@/commands/app/templates/runtime/ui/PeriodSummary.tsx.txt";
import runtimePeriodSummaryStyles from "@/commands/app/templates/runtime/ui/PeriodSummary.css.txt";

export const runtimeFiles = {
  "package.json": runtimePackage,
  "server.ts": runtimeServer,
  "contract.ts": runtimeContract,
  "local.ts": runtimeLocal,
  "client.ts": runtimeClient,
  "format.ts": runtimeFormat,
  "appearance.ts": runtimeAppearance,
  "react.tsx": runtimeReact,
  "ui/index.ts": runtimeUiIndex,
  "ui/classNames.ts": runtimeClassNames,
  "ui/data-context.ts": runtimeDataContext,
  "ui/icons.ts": runtimeIcons,
  "ui/ThemeSelector.tsx": runtimeThemeSelector,
  "ui/ThemeSelector.css": runtimeThemeStyles,
  "ui/AppFooter.tsx": runtimeFooter,
  "ui/AppFooter.css": runtimeFooterStyles,
  "ui/AltertableLogo.tsx": runtimeAltertableLogo,
  "ui/AppLayout.tsx": runtimeAppLayout,
  "ui/AppLayout.css": runtimeAppLayoutStyles,
  "ui/Stack.tsx": runtimeStack,
  "ui/Stack.css": runtimeStackStyles,
  "ui/Grid.tsx": runtimeGrid,
  "ui/Grid.css": runtimeGridStyles,
  "ui/StorySection.tsx": runtimeStorySection,
  "ui/StorySection.css": runtimeStorySectionStyles,
  "ui/AppHeader.tsx": runtimeAppHeader,
  "ui/AppHeader.css": runtimeAppHeaderStyles,
  "ui/AppToolbar.tsx": runtimeAppToolbar,
  "ui/AppToolbar.css": runtimeAppToolbarStyles,
  "ui/AppScope.tsx": runtimeAppScope,
  "ui/AppScope.css": runtimeAppScopeStyles,
  "ui/Button.tsx": runtimeButton,
  "ui/Button.css": runtimeButtonStyles,
  "ui/IconButton.tsx": runtimeIconButton,
  "ui/Kbd.tsx": runtimeKbd,
  "ui/Kbd.css": runtimeKbdStyles,
  "ui/MetricCard.tsx": runtimeMetricCard,
  "ui/MetricCard.css": runtimeMetricCardStyles,
  "ui/CardEvidence.ts": runtimeCardEvidence,
  "ui/VisualizationCard.tsx": runtimeVisualizationCard,
  "ui/VisualizationCard.css": runtimeVisualizationCardStyles,
  "ui/TableCard.tsx": runtimeTableCard,
  "ui/TableCard.css": runtimeTableCardStyles,
  "ui/DataSection.tsx": runtimeDataSection,
  "ui/Breakdown.tsx": runtimeBreakdown,
  "ui/Breakdown.css": runtimeBreakdownStyles,
  "ui/Ranking.tsx": runtimeRanking,
  "ui/Ranking.css": runtimeRankingStyles,
  "ui/comparison.ts": runtimeComparison,
  "ui/DataPanel.tsx": runtimeDataPanel,
  "ui/DataPanel.css": runtimeDataPanelStyles,
  "ui/EmptyState.tsx": runtimeEmptyState,
  "ui/EmptyState.css": runtimeEmptyStateStyles,
  "ui/CardDisclosure.tsx": runtimeCardDisclosure,
  "ui/CardDisclosure.css": runtimeCardDisclosureStyles,
  "ui/CardViewTabs.tsx": runtimeCardViewTabs,
  "ui/CardViewTabs.css": runtimeCardViewTabsStyles,
  "ui/LiveControl.tsx": runtimeLiveControl,
  "ui/LiveControl.css": runtimeLiveControlStyles,
  "ui/ComparisonVisual.tsx": runtimeComparisonVisual,
  "ui/ComparisonVisual.css": runtimeComparisonVisualStyles,
  "ui/DataTable.tsx": runtimeDataTable,
  "ui/DataTable.css": runtimeDataTableStyles,
  "ui/StatusPanel.tsx": runtimeStatusPanel,
  "ui/StatusPanel.css": runtimeStatusPanelStyles,
  "ui/Skeleton.tsx": runtimeSkeleton,
  "ui/Skeleton.css": runtimeSkeletonStyles,
  "ui/ContentSkeleton.tsx": runtimeContentSkeleton,
  "ui/ContentSkeleton.css": runtimeContentSkeletonStyles,
  "ui/DataBoundary.tsx": runtimeDataBoundary,
  "ui/DataBoundary.css": runtimeDataBoundaryStyles,
  "ui/DataViewToast.tsx": runtimeDataViewToast,
  "ui/DataViewToast.css": runtimeDataViewToastStyles,
  "ui/PlayStory.tsx": runtimePlayStory,
  "ui/PlayStory.css": runtimePlayStoryStyles,
  "ui/Tabs.tsx": runtimeTabs,
  "ui/Tabs.css": runtimeTabsStyles,
  "ui/DateRangePicker.tsx": runtimeDateRangePicker,
  "ui/DateRangePicker.css": runtimeDateRangePickerStyles,
  "ui/variables.ts": runtimeVariables,
  "ui/PeriodSummary.tsx": runtimePeriodSummary,
  "ui/PeriodSummary.css": runtimePeriodSummaryStyles,
  "ui/AboutData.tsx": runtimeAboutData,
  "ui/AboutData.css": runtimeAboutDataStyles,
  "ui/Sheet.tsx": runtimeSheet,
  "ui/Sheet.css": runtimeSheetStyles,
  "ui/GlossaryExplanation.tsx": runtimeGlossaryExplanation,
  "ui/Inspect.css": runtimeInspectStyles,
  "ui/HelpPopover.tsx": runtimeHelpPopover,
  "ui/HelpPopover.css": runtimeHelpPopoverStyles,
  "ui/Tooltip.tsx": runtimeTooltip,
  "ui/Tooltip.css": runtimeTooltipStyles,
  "ui/DateTimeTooltip.tsx": runtimeDateTimeTooltip,
  "ui/DateTimeTooltip.css": runtimeDateTimeTooltipStyles,
  "ui/SearchField.tsx": runtimeSearchField,
  "ui/SearchField.css": runtimeSearchFieldStyles,
  "ui/searchItems.ts": runtimeSearchItems,
  "ui/SearchMatch.tsx": runtimeSearchMatch,
  "ui/SearchMatch.css": runtimeSearchMatchStyles,
  "ui/Combobox.tsx": runtimeCombobox,
  "ui/Combobox.css": runtimeComboboxStyles,
  "ui/shortcuts.ts": runtimeShortcuts,
  "ui/search.ts": runtimeSearch,
  "ui/UpdatedAt.tsx": runtimeUpdatedAt,
  "ui/UpdatedAt.css": runtimeUpdatedAtStyles,
  "ui/RefreshRegion.tsx": runtimeRefreshRegion,
  "ui/RefreshRegion.css": runtimeRefreshRegionStyles,
  "ui/RefreshControl.tsx": runtimeRefreshControl,
  "ui/RefreshControl.css": runtimeRefreshControlStyles,
  "ui/QueryList.tsx": runtimeQueryList,
  "ui/QueryList.css": runtimeQueryListStyles,
} as const;

type RuntimeIntegrity = { version: string; sha256: Record<string, string> };
export type InstalledRuntime = RuntimeIntegrity;
export const runtimePath = ".altertable/runtime";
export const runtimeTemplateDirectory = fileURLToPath(
  new URL("../templates/runtime/", import.meta.url),
);

export async function readRuntimeTemplates(
  directory = runtimeTemplateDirectory,
): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      Object.keys(runtimeFiles).map(
        async (name) => [name, await readFile(join(directory, `${name}.txt`), "utf8")] as const,
      ),
    ),
  );
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function currentRuntimeIntegrity(
  files: Record<string, string> = runtimeFiles,
): RuntimeIntegrity {
  return {
    version: (JSON.parse(files["package.json"]!) as { version: string }).version,
    sha256: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, hash(content)]),
    ),
  };
}

export async function installedRuntimeIntegrity(directory: string): Promise<InstalledRuntime> {
  const path = runtimePath;
  let integrity: RuntimeIntegrity;
  try {
    integrity = JSON.parse(
      await readFile(join(directory, path, "integrity.json"), "utf8"),
    ) as RuntimeIntegrity;
  } catch {
    throw new ConfigurationError(
      "Data app runtime has no integrity record. Restore it from the original generated project.",
    );
  }
  if (
    typeof integrity.version !== "string" ||
    !integrity.sha256 ||
    typeof integrity.sha256 !== "object" ||
    !Object.keys(integrity.sha256).length
  ) {
    throw new ConfigurationError("Data app runtime has an invalid integrity record.");
  }
  for (const [name, checksum] of Object.entries(integrity.sha256)) {
    if (name.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new ConfigurationError("Data app runtime has an invalid integrity record.");
    }
    let content: string;
    try {
      content = await readFile(join(directory, path, name), "utf8");
    } catch {
      throw new ConfigurationError(`Data app runtime is missing ${name}.`);
    }
    if (hash(content) !== checksum) {
      throw new ConfigurationError(
        `Data app runtime ${name} was modified. Keep app code outside ${path}/.`,
      );
    }
  }
  return integrity;
}
