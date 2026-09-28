import {
  AboutData,
  AppFooter,
  AppHeader,
  AppLayout,
  AppScope,
  AppToolbar,
  Button,
  VisualizationCard,
  DateRangePicker,
  dateRangeControl,
  dateRangeVariable,
  defineAppVariables,
  HelpPopover,
  GlossaryExplanation,
  MetricCard,
  PeriodSummary,
  PlayStory,
  RefreshRegion,
  Sheet,
  Skeleton,
  Stack,
  StatusPanel,
  ThemeSelector,
  Tooltip,
  TooltipProvider,
  UpdatedAt,
  useAppVariables,
} from "../src/ui/index.ts";
import type { AppToolbarProps, PlayStoryProps } from "../src/ui/index.ts";

const toolbarProps = {
  refresh: { refreshing: false, onRefresh: () => {} },
} satisfies AppToolbarProps;
const storyProps = { title: "Story", steps: [], dataContext: null! } satisfies PlayStoryProps;
const empty = { glossary: { title: "No terms" }, queries: { title: "No queries" } };
const variables = defineAppVariables({
  period: dateRangeVariable({
    key: "period",
    minDate: "2020-01-01",
    maxDate: "2020-01-07",
    maxRangeDays: 7,
    timeZone: "UTC",
    defaultValue: { kind: "preset", id: "last-3" },
  }),
});

export function CompositionCheck() {
  const appVariables = useAppVariables(variables);
  const range = variables.period.resolve(appVariables.values.period);
  const dateRange = dateRangeControl(variables.period, appVariables.values.period, (value) =>
    appVariables.set("period", value),
  );
  void range;
  return (
    <AppLayout
      className="main"
      layoutProps={{ className: "layout", id: "app" }}
      footerProps={{ className: "footer" }}
      tooltipProviderProps={{ delay: 400 }}
    >
      <DateRangePicker {...dateRange} />
      <AppHeader
        title="Example"
        scope={<AppScope organization="Altertable" environment="production" />}
        toolbar={<AppToolbar {...toolbarProps} />}
        headingProps={{ className: "heading" }}
      >
        Subtitle
      </AppHeader>
      <AppFooter className="footer" data-testid="footer">
        <Button className="action" aria-label="Action" />
      </AppFooter>
      <AppScope
        organization="Altertable"
        environment="production"
        className="scope"
        title="Scope"
      />
      <AppToolbar
        className="toolbar"
        data-testid="toolbar"
        dateRange={{
          value: null,
          onChange: () => {},
          className: "dates",
          calendarFooter: "Choose dates",
        }}
        refresh={{
          refreshing: false,
          onRefresh: () => {},
          buttonProps: { className: "reload" },
        }}
        controlsProps={{ className: "controls" }}
        end={<Button>End</Button>}
      >
        <Button>Extra</Button>
      </AppToolbar>
      <AppToolbar
        period={
          <PeriodSummary
            period={{ kind: "rolling", amount: 24, unit: "hour", end: new Date().toISOString() }}
            comparison={{ kind: "previous" }}
          />
        }
        updatedAt={<UpdatedAt timestamp={0} />}
      />
      <VisualizationCard title="Panel" visual="Content" className="panel" data-testid="panel" />
      <MetricCard
        label="Metric"
        value={1}
        insight={<Button>Explain</Button>}
        className="metric"
        data-testid="metric"
      />
      <Stack gap="md" role="group" aria-label="Request states">
        <StatusPanel status="empty" title="Empty" onMouseEnter={() => {}}>
          More detail
        </StatusPanel>
        <StatusPanel
          status="error"
          title="Unavailable"
          action={
            <Button size="icon" aria-label="Retry">
              ↻
            </Button>
          }
        />
      </Stack>
      <Skeleton className="skeleton" style={{ width: 40 }} data-testid="skeleton" />
      <RefreshRegion refreshing={false} className="region" contentProps={{ className: "content" }}>
        Content
      </RefreshRegion>
      <ThemeSelector theme={null!} className="theme" title="Theme" />
      <DateRangePicker value={null} onChange={() => {}} isDisabled className="dates" />
      <HelpPopover
        trigger="Help"
        triggerLabel="Help"
        label="Help"
        triggerProps={{ className: "trigger", id: "help" }}
        panelProps={{ className: "panel" }}
      >
        Details
      </HelpPopover>
      <UpdatedAt timestamp={0} triggerClassName="updated" panelProps={{ className: "exact" }} />
      <GlossaryExplanation entry={null!} empty={empty} className="glossary" title="Signups" />
      <AboutData
        empty={empty}
        dataContext={null!}
        className="context"
        tooltip="About the data"
        footer="More context"
        sheetProps={{ className: "details" }}
      >
        Context
      </AboutData>
      <Sheet open={false} onOpenChange={() => {}} title="Details" className="sheet">
        Body
      </Sheet>
      <PlayStory
        {...storyProps}
        className="play"
        headerActions={<Button>Save</Button>}
        footer="Notes"
        launcherProps={{ className: "launcher" }}
        dialogProps={{ className: "slides" }}
      />
      <Tooltip content="A tip" tooltipProps={{ className: "tip" }}>
        <Button>Help</Button>
      </Tooltip>
      <TooltipProvider delay={400}>
        <Tooltip content="Another tip">
          <Button>More</Button>
        </Tooltip>
      </TooltipProvider>
    </AppLayout>
  );
}
