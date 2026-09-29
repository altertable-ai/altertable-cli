import {
  AboutData,
  AppFooter,
  AppHeader,
  AppLayout,
  AppScope,
  AppToolbar,
  VariableBar,
  Button,
  VisualizationWidget,
  DateRangePicker,
  dateRangeControl,
  dateRangeVariable,
  defineAppVariables,
  HelpPopover,
  GlossaryExplanation,
  MetricWidget,
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
  defineDataContext,
  createDataContext,
  evidenceFor,
} from "../src/react/ui/index.ts";
import type { AppToolbarProps, PlayStoryProps } from "../src/react/ui/index.ts";
import { defineDateRangeContract, defineQueryNames } from "../src/core/contract.ts";

const toolbarProps = {
  refresh: { refreshing: false, onRefresh: () => {} },
} satisfies AppToolbarProps;
const empty = { glossary: { title: "No terms" }, queries: { title: "No queries" } };
const storyProps = {
  title: "Story",
  steps: [],
  dataContext: null!,
  empty,
} satisfies PlayStoryProps;
const dataContext = defineDataContext({
  description: "Orders",
  glossary: { orders: { term: "Orders", definition: "Completed orders." } },
});
const queryNames = defineQueryNames({ totals: "order-totals" });
const evidence = createDataContext(queryNames)(dataContext).evidence({
  id: "orders",
  glossaryIds: ["orders"],
  queryNames: [queryNames.totals],
});
// @ts-expect-error A widget cannot refer to a glossary entry absent from this context.
evidenceFor(dataContext)({ id: "missing", glossaryIds: ["unknown"] });
// @ts-expect-error A widget cannot refer to a query absent from the named query registry.
evidenceFor(dataContext, queryNames)({ id: "missing-query", queryNames: ["other-query"] });
const variables = defineAppVariables({
  period: dateRangeVariable({
    key: "period",
    contract: defineDateRangeContract({
      minDate: "2020-01-01",
      maxDate: "2020-01-07",
      maxRangeDays: 7,
      timeZone: "UTC",
    }),
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
      <VariableBar data-testid="variables">
        <DateRangePicker
          value={null}
          onChange={() => {}}
          className="dates"
          calendarFooter="Choose dates"
        />
      </VariableBar>
      <AppToolbar updatedAt={<UpdatedAt timestamp={0} />} />
      <VariableBar>
        <PeriodSummary
          period={{ kind: "rolling", amount: 24, unit: "hour", end: new Date().toISOString() }}
          comparison={{ kind: "previous" }}
        />
      </VariableBar>
      <VisualizationWidget title="Panel" visual="Content" className="panel" data-testid="panel" />
      <MetricWidget
        label="Metric"
        value={1}
        format={{ kind: "count" }}
        evidence={evidence}
        insight={<Button>Explain</Button>}
        className="metric"
        data-testid="metric"
      />
      <Stack gap="md">
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
