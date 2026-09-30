import { useEffect, useState, type ReactNode } from "react";
import {
  AppHeader,
  AppScope,
  AppToolbar,
  AppFooter,
  VariableBar,
  DimensionPicker,
  dimensionFilter,
  DataViewToast,
  AboutData,
  AppIcon,
  Breakdown,
  Button,
  Checkbox,
  Combobox,
  ComparisonVisual,
  ContentSkeleton,
  DataBoundary,
  DataSection,
  DataTable,
  DataTableEmptyRow,
  DataTableShare,
  DataTableTimestamp,
  DataWidget,
  DateRangePicker,
  DateTimeTooltip,
  EmptyState,
  GlossaryDefinition,
  GlossaryExplanation,
  GradientScroll,
  Grid,
  GridItem,
  HelpPopover,
  IconButton,
  Kbd,
  LiveControl,
  MetricWidget,
  PeriodSummary,
  PresentStory,
  Ranking,
  RefreshRegion,
  SearchField,
  SearchMatch,
  Sheet,
  Skeleton,
  Stack,
  StatusPanel,
  TableWidget,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tooltip,
  UpdatedAt,
  WidgetDisclosure,
  WidgetViewTabs,
  SelectableBarChart,
  type DateRange,
  type LiveIntervalSeconds,
  type WidgetStatus,
  type DataView,
  type DimensionSelection,
  type AppIconName,
} from "@altertable/data-app/react";
import "./gallery.css";

const dimension = dimensionFilter({
  key: "fixture_dimension",
  label: "Typed interface",
  valueType: "string",
  selection: "multiple",
  allowMissing: true,
  options: [
    { value: "null", label: "Literal null", count: 0 },
    { value: "http", label: "HTTP", count: 12 },
  ],
});
const options = [
  { id: "http", label: "HTTP" },
  { id: "postgres", label: "Postgres" },
  { id: "other", label: "Other" },
];
const empty = { title: "No records", description: "Try another range or clear your filters." };
const evidence = { id: "transition", queryNames: ["gallery-trend"] as [string] };
const glossary = {
  term: "Activity",
  definition: "Recorded events, including measured zero values.",
  queryNames: ["gallery-trend"],
};
const context = { description: "Inspectable fixture data.", glossary: { activity: glossary } };
const queries = [
  {
    name: "gallery-trend",
    statement: "SELECT day, count(*) AS events\nFROM events\nGROUP BY day ORDER BY day",
    queryId: "gallery-query",
  },
];
const period = {
  kind: "calendar",
  start: "2026-09-24",
  end: "2026-09-30",
  timeZone: "UTC",
} as const;
const row = { id: 1, name: "A record with a long label / 多言語 / café", amount: 1234567.89 };
const columns = [
  { id: "name", header: "Record", cell: (item: typeof row) => item.name },
  {
    id: "amount",
    header: "Amount",
    type: "number" as const,
    cell: (item: typeof row) => item.amount.toLocaleString(),
  },
] as const;

function Case({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <article className="gallery-case">
      <h3>{title}</h3>
      {note && <p className="gallery-note">{note}</p>}
      <div className="gallery-stage">{children}</div>
    </article>
  );
}
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={title}>
      <h2>{title}</h2>
      <div className="gallery-cases">{children}</div>
    </section>
  );
}

export function GalleryCases() {
  const [search, setSearch] = useState("");
  const [single, setSingle] = useState("http");
  const [multi, setMulti] = useState<string[]>(["http", "postgres"]);
  const [checked, setChecked] = useState(true);
  const [status, setStatus] = useState<WidgetStatus>({ kind: "idle" });
  const [picker, setPicker] = useState<"ready" | "updating" | "error">("ready");
  const [dimensionValue, setDimensionValue] = useState<DimensionSelection<"http" | "null">>({
    kind: "all",
  });
  const [uncached, setUncached] = useState<"error" | "loading" | "ready">("error");
  const [notice, setNotice] = useState(false);
  const [cycle, setCycle] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [dates, setDates] = useState<DateRange | null>({ start: "2026-09-24", end: "2026-09-30" });
  const [comparison, setComparison] = useState(false);
  const [live, setLive] = useState(false);
  const [interval, setInterval] = useState<LiveIntervalSeconds>(60);
  const [view, setView] = useState<"ready" | "empty">("ready");
  const [selected, setSelected] = useState<string | null>(null);
  const [request, setRequest] = useState<
    "loading" | "ready" | "empty" | "error" | "updating" | "stale-error"
  >("ready");
  useEffect(() => {
    if (!cycle) return;
    const timers = [
      window.setTimeout(() => setPicker("updating"), 1600),
      window.setTimeout(() => setPicker("error"), 3200),
      window.setTimeout(() => {
        setPicker("ready");
        setCycle(false);
      }, 5000),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [cycle]);
  useEffect(() => {
    if (uncached !== "loading") return;
    const timer = window.setTimeout(() => setUncached("ready"), 1000);
    return () => window.clearTimeout(timer);
  }, [uncached]);
  const retry = () => setStatus({ kind: "idle" });
  const widgetStatus = status.kind === "error" ? { ...status, onRetry: retry } : status;
  const dataView: DataView<string, string> =
    request === "loading"
      ? { kind: "loading" }
      : request === "empty"
        ? { kind: "empty", input: "September" }
        : request === "error"
          ? { kind: "error", error: new Error("Fixture failure") }
          : request === "ready"
            ? { kind: "ready", data: "42 recorded events", input: "September" }
            : request === "updating"
              ? {
                  kind: "updating",
                  data: "42 recorded events",
                  displayedInput: "September",
                  requestedInput: "October",
                  message: "Updating October",
                }
              : {
                  kind: "stale-error",
                  data: "42 recorded events",
                  displayedInput: "September",
                  requestedInput: "October",
                  error: new Error("Fixture failure"),
                  message: "October couldn’t refresh",
                };
  return (
    <>
      <Section id="buttons" title="Buttons and selection">
        <Case title="Every button variant and size">
          <div className="gallery-wrap">
            {(["elevated", "outline", "ghost"] as const).map((variant) =>
              (["default", "compact"] as const).map((size) => (
                <Button key={`${variant}-${size}`} variant={variant} size={size}>
                  {variant} · {size}
                </Button>
              )),
            )}
            <IconButton icon="refresh" label="Refresh fixture" />
            <IconButton icon="info" label="Disabled information" disabled />
            <Button disabled variant="ghost">
              Disabled ghost
            </Button>
            <Button aria-busy="true">
              <AppIcon name="loading" /> Busy action
            </Button>
          </div>
        </Case>
        <Case title="Checkbox copy, checked and disabled">
          <Stack>
            <Checkbox
              label="Compact label"
              checked={checked}
              onChange={setChecked}
              description="Muted supporting copy with a smaller size."
            />
            <Checkbox label="Disabled unchecked" checked={false} onChange={() => {}} disabled />
            <Checkbox label="Disabled checked" checked onChange={() => {}} disabled />
            <Checkbox
              label="A long checkbox label wraps in a constrained layout without losing the mark alignment"
              checked={checked}
              onChange={setChecked}
              description="Supporting text can wrap over more than one line too."
            />
          </Stack>
        </Case>
        <Case title="Search empty, populated and disabled">
          <Stack>
            <SearchField label="Edge search" value={search} onChange={setSearch} />
            <SearchField
              label="Disabled search"
              value="Retained query"
              onChange={() => {}}
              inputProps={{ disabled: true }}
              clearButtonProps={{ disabled: true }}
            />
            <SearchMatch
              match={{ text: "Café and 多言語 matching", ranges: [{ start: 0, end: 4 }] }}
            />
            <p>
              Keyboard hint <Kbd>Escape</Kbd>{" "}
              <Kbd shortcut={{ modifier: "alt", code: "KeyI", key: "I" }} />
            </p>
          </Stack>
        </Case>
      </Section>
      <Section id="picker-edges" title="Picker edge cases">
        <Case title="Single select and reset">
          <Combobox
            label="Resettable category"
            options={options}
            value={single}
            onChange={setSingle}
            resetValue="http"
          />
        </Case>
        <Case title="At selection capacity">
          <Combobox
            label="At capacity"
            options={options}
            values={multi}
            onChange={setMulti}
            maxSelected={2}
            emptySelectionLabel="All categories"
          />
        </Case>
        <Case title="Retained unavailable selection">
          <Combobox
            label="Unavailable category"
            options={[]}
            value="Previously selected"
            onChange={() => {}}
            loading
          />
        </Case>
        <Case title="Failure without cached options">
          <Combobox
            label="No cached categories"
            options={uncached === "ready" ? options : []}
            values={[]}
            onChange={() => {}}
            maxSelected={2}
            emptySelectionLabel="Select categories"
            error={uncached === "error"}
            loading={uncached === "loading"}
            onRetry={() => setUncached("loading")}
          />
        </Case>
        <Case title="One option">
          <Combobox label="One category" options={[options[0]!]} value="http" onChange={() => {}} />
        </Case>
        <Case title="Long options and descriptions">
          <Combobox
            label="Verbose category"
            options={[
              {
                id: "long",
                label: "A very long category with 多言語 and accented café text",
                description:
                  "A detailed explanation that wraps onto multiple lines in a narrow popup.",
              },
            ]}
            value="long"
            onChange={() => {}}
          />
        </Case>
        <Case title="Hundred options and scroll edges">
          <Combobox
            label="Many categories"
            options={Array.from({ length: 100 }, (_, id) => ({
              id: String(id),
              label: `Category ${id + 1}`,
            }))}
            value="99"
            onChange={() => {}}
          />
        </Case>
        <Case
          title="Ready → refreshing → failed → recovered"
          note="Start the five-second cycle, then open the picker. Search and cached choices stay in place."
        >
          <Stack>
            <Button
              onClick={() => {
                setPicker("ready");
                setCycle(true);
              }}
              disabled={cycle}
            >
              Start picker cycle
            </Button>
            <Combobox
              label="Cycling categories"
              options={options}
              value="http"
              onChange={() => {}}
              loading={picker === "updating"}
              error={picker === "error"}
              onRetry={() => setPicker("ready")}
            />
          </Stack>
        </Case>
      </Section>
      <Section id="refresh" title="Widget refresh transitions">
        <Case
          title="Reserved feedback slot"
          note="The same widget moves between states. Its data and geometry stay fixed."
        >
          <div className="gallery-wrap">
            <Button onClick={() => setStatus({ kind: "idle" })}>Widget ready</Button>
            <Button onClick={() => setStatus({ kind: "updating" })}>Widget updating</Button>
            <Button onClick={() => setStatus({ kind: "error" })}>Widget failed</Button>
            <Button
              onClick={() =>
                setStatus({
                  kind: "error",
                  message:
                    "A deliberately long refresh failure message should truncate instead of moving the body or hiding retry",
                })
              }
            >
              Long widget failure
            </Button>
          </div>
        </Case>
        <Case title="Shared widget state">
          <DataWidget title="Stable activity" status={widgetStatus} evidence={evidence}>
            <p>42 events remain visible.</p>
          </DataWidget>
        </Case>
        <Case title="Metric refresh">
          <MetricWidget
            label="Stable metric"
            value={42}
            format={{ kind: "count" }}
            status={widgetStatus}
          />
        </Case>
        <Case title="Table refresh">
          <TableWidget
            title="Stable table"
            rows={[row]}
            rowKey={(item) => item.id}
            columns={columns}
            status={widgetStatus}
            empty={empty}
          />
        </Case>
      </Section>
      <Section id="metrics" title="Metric formats and comparisons">
        {([0, -12, 123456789] as const).map((value) => (
          <Case key={value} title={`Count ${value}`}>
            <MetricWidget label="Recorded value" value={value} format={{ kind: "count" }} />
          </Case>
        ))}
        <Case title="Ratio">
          <MetricWidget label="Conversion rate" value={0.125} format={{ kind: "ratio" }} />
        </Case>
        <Case title="Currency">
          <MetricWidget
            label="Revenue"
            value={12345.67}
            format={{ kind: "currency", currency: "EUR" }}
          />
        </Case>
        <Case title="Custom unavailable value">
          <MetricWidget
            label="Unavailable measurement"
            content="—"
            description="Unavailable differs from measured zero."
          />
        </Case>
        <Case title="Metric loading">
          <MetricWidget label="Loading metric" loading />
        </Case>
        {([0, 100, null] as const).map((previous) => (
          <Case key={String(previous)} title={`Previous ${previous ?? "unavailable"}`}>
            <MetricWidget
              label="Compared events"
              value={80}
              format={{ kind: "count" }}
              comparison={{
                current: { value: 80, formattedValue: "80" },
                previous: {
                  value: previous,
                  formattedValue: previous === null ? "—" : String(previous),
                },
                favorableDirection: "up",
              }}
            />
          </Case>
        ))}
        <Case title="Comparison visual">
          <ComparisonVisual
            label="Reduced errors"
            current={{ value: 12, formattedValue: "12" }}
            previous={{ value: 20, formattedValue: "20" }}
            favorableDirection="down"
          />
        </Case>
      </Section>
      <Section id="tables" title="Table boundaries">
        <Case title="Empty table keeps column headers">
          <TableWidget
            title="Empty records"
            rows={[]}
            rowKey={(item: typeof row) => item.id}
            columns={columns}
            empty={empty}
          />
        </Case>
        <Case title="One complete row">
          <TableWidget
            title="Complete records"
            rows={[row]}
            rowKey={(item) => item.id}
            columns={columns}
            pagination={false}
            empty={empty}
          />
        </Case>
        <Case title="Preview cap">
          <TableWidget
            title="Preview records"
            rows={[row, { ...row, id: 2 }]}
            rowKey={(item) => item.id}
            columns={columns}
            limit={1}
            empty={empty}
          />
        </Case>
        <Case title="Table skeleton">
          <TableWidget
            title="Loading records"
            reading={{ loading: true }}
            evidence={evidence}
            rowKey={(item: typeof row) => item.id}
            columns={columns}
            skeletonRows={3}
            empty={empty}
          />
        </Case>
        <Case title="Native table, numeric, share and timestamp">
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" data-type="number">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  <DataTableTimestamp value="2026-09-30T12:00:00Z" timeZone="UTC" />
                </th>
                <td data-type="number">
                  <DataTableShare value={0.3333} />
                </td>
              </tr>
              <DataTableEmptyRow
                colSpan={2}
                title="Empty row"
                description="Column span is declared once."
              />
            </tbody>
          </DataTable>
        </Case>
      </Section>
      <Section id="charts" title="Chart and collection boundaries">
        {(
          [
            [],
            [{ id: "zero", label: "Measured zero", value: 0 }],
            [
              { id: "large", label: "Large", value: 1000000 },
              { id: "tiny", label: "Tiny", value: 1 },
            ],
            Array.from({ length: 40 }, (_, i) => ({
              id: String(i),
              label: `Day ${i + 1}`,
              value: i % 7,
            })),
          ] as const
        ).map((items, index) => (
          <Case
            key={index}
            title={["Empty chart", "Zero chart", "Extreme magnitudes", "Scrollable chart"][index]!}
          >
            <SelectableBarChart
              items={items}
              selectedId={selected}
              onSelectionChange={setSelected}
              unit="events"
              ariaLabel={`Chart edge ${index}`}
            />
          </Case>
        ))}
        <Case title="Ranking ties, zero and details">
          <Ranking
            items={[
              { id: "a", label: "First", value: 5, detail: "Supporting context" },
              { id: "b", label: "Tied", value: 5 },
              { id: "c", label: "Zero", value: 0 },
            ]}
          />
        </Case>
        <Case title="Ranking empty">
          <Ranking items={[]} />
        </Case>
        <Case title="Dominant breakdown with remainder">
          <Breakdown
            total={100}
            items={[
              { id: "a", label: "Dominant", value: 90 },
              { id: "b", label: "Small", value: 3 },
            ]}
          />
        </Case>
        <Case title="Zero breakdown">
          <Breakdown total={0} items={[{ id: "a", label: "Measured zero", value: 0 }]} />
        </Case>
      </Section>
      <Section id="requests" title="Request boundaries and recovery">
        <Case
          title="All request states"
          note="No network calls. Initial loading uses a skeleton; refresh retains the displayed result."
        >
          <div className="gallery-wrap">
            {(["loading", "ready", "empty", "error", "updating", "stale-error"] as const).map(
              (kind) => (
                <Button key={kind} onClick={() => setRequest(kind)}>
                  {kind}
                </Button>
              ),
            )}
          </div>
        </Case>
        <Case title="DataSection">
          <DataSection
            result={{ view: dataView, refetch: () => setRequest("ready") }}
            empty={empty}
            label="Fixture request"
          >
            {(data, input) => (
              <p>
                {data} · {input}
              </p>
            )}
          </DataSection>
        </Case>
        <Case title="Custom DataBoundary">
          <DataBoundary
            view={dataView}
            loading={<ContentSkeleton variant="panel" />}
            empty={<EmptyState {...empty} />}
            error={() => (
              <StatusPanel
                status="error"
                title="Request failed"
                action={<Button onClick={() => setRequest("ready")}>Recover request</Button>}
              />
            )}
            notice="inline"
          >
            {(data) => <p>{data}</p>}
          </DataBoundary>
        </Case>
        <Case title="Retained content with optional dimming">
          <RefreshRegion refreshing={request === "updating"} dimOnUpdate>
            <p>The last displayed reading stays here.</p>
          </RefreshRegion>
        </Case>
      </Section>
      <Section id="dates" title="Dates, periods and freshness">
        <Case title="Bounded date range and comparison">
          <DateRangePicker
            label="Gallery dates"
            value={dates}
            onChange={setDates}
            minDate="2026-09-01"
            maxDate="2026-09-30"
            maxRangeDays={30}
            timeZone="UTC"
            comparison={{
              enabled: comparison,
              range: { start: "2026-09-17", end: "2026-09-23" },
              onChange: setComparison,
            }}
          />
        </Case>
        <Case title="Unset and disabled dates">
          <Stack>
            <DateRangePicker label="Unset dates" value={null} onChange={() => {}} />
            <DateRangePicker label="Disabled dates" value={dates} onChange={() => {}} isDisabled />
          </Stack>
        </Case>
        <Case title="Calendar and rolling summaries">
          <Stack>
            <PeriodSummary period={period} comparison={{ kind: "previous" }} />
            <PeriodSummary
              period={{ kind: "rolling", amount: 24, unit: "hour", end: "2026-09-30T12:00:00Z" }}
            />
          </Stack>
        </Case>
        <Case title="Live controls and timestamp details">
          <Stack>
            <LiveControl
              enabled={live}
              onChange={setLive}
              intervalSeconds={interval}
              onIntervalChange={setInterval}
            />
            <UpdatedAt timestamp={Date.parse("2026-09-30T12:00:00Z")} />
            <DateTimeTooltip date={new Date("2026-09-30T12:00:00Z")} timeZone="UTC">
              Exact UTC time
            </DateTimeTooltip>
          </Stack>
        </Case>
      </Section>
      <Section id="empty-loading" title="Empty states, skeletons and status panels">
        <Case title="Visual empty title and description">
          <EmptyState
            title="Nothing to show yet"
            description="A description has quieter typography than its title."
          />
        </Case>
        <Case title="Long empty copy">
          <EmptyState
            title="No records match this combination of dates and categories"
            description="Clear one filter or select a wider period. This explanation wraps without changing the title hierarchy."
          />
        </Case>
        <Case title="Compact table empty">
          <EmptyState title="No matches" variant="table" />
        </Case>
        {(["metric", "panel", "ranking"] as const).map((variant) => (
          <Case key={variant} title={`${variant} skeleton`}>
            <ContentSkeleton variant={variant} rows={3} />
          </Case>
        ))}
        <Case title="Inline skeleton">
          <Skeleton style={{ width: "80%", height: 16 }} />
        </Case>
        <Case title="Initial failure">
          <StatusPanel
            status="error"
            title="Couldn’t load this view"
            description="Check the connection and try again."
            action={<Button>Retry initial request</Button>}
            details="Optional technical details"
          />
        </Case>
      </Section>
      <Section id="overlays" title="Inspection, overlays and disclosures">
        <Case title="Glossary and SQL">
          <Stack>
            <GlossaryDefinition entry={glossary}>Activity definition</GlossaryDefinition>
            <GlossaryExplanation entry={glossary} queries={queries} />
            <AboutData
              id="gallery-query-inspection"
              title="Query inspection"
              shortcut={false}
              dataContext={context}
              queries={queries}
            >
              Inspect glossary and SQL
            </AboutData>
            <AboutData
              id="gallery-empty-inspection"
              title="Empty inspection"
              shortcut={false}
              dataContext={{ glossary: {}, description: "No evidence supplied." }}
              queries={[]}
            >
              Inspect unavailable evidence
            </AboutData>
          </Stack>
        </Case>
        <Case title="Tooltip and help popover">
          <Stack>
            <Tooltip content="A deliberately long tooltip that wraps to explain this action without overflowing the viewport.">
              <Button>Long tooltip</Button>
            </Tooltip>
            <HelpPopover
              trigger="What does this mean?"
              triggerLabel="Explain fixture"
              label="Fixture explanation"
            >
              <p>Supplemental context opens on deliberate hover or keyboard activation.</p>
            </HelpPopover>
          </Stack>
        </Case>
        <Case title="Sheet header actions and footer">
          <Button onClick={() => setSheet(true)}>Open fixture sheet</Button>
          <Sheet
            open={sheet}
            onOpenChange={setSheet}
            title="Fixture sheet with a longer title"
            description="Focus is trapped and Escape returns to the trigger."
            headerActions={<Button variant="ghost">Header action</Button>}
            footer={<Button onClick={() => setSheet(false)}>Done</Button>}
          >
            <p>Scrollable sheet content.</p>
            <GradientScroll style={{ maxHeight: 160 }}>
              {Array.from({ length: 20 }, (_, i) => (
                <p key={i}>Detail {i + 1}</p>
              ))}
            </GradientScroll>
          </Sheet>
        </Case>
        <Case title="Native disclosure">
          <WidgetDisclosure label="Additional evidence">
            <p>Collapsed information remains reachable by keyboard.</p>
          </WidgetDisclosure>
        </Case>
        <Case title="Standalone tabs">
          <Tabs>
            <TabList aria-label="Gallery tabs">
              <Tab id="first">First</Tab>
              <Tab id="second">Second</Tab>
            </TabList>
            <TabPanels>
              <TabPanel id="first">First panel</TabPanel>
              <TabPanel id="second">Second panel</TabPanel>
            </TabPanels>
          </Tabs>
        </Case>
        <Case title="Independent empty view">
          <WidgetViewTabs
            label="Empty view tabs"
            selectedKey={view}
            onSelectionChange={setView}
            views={[
              {
                id: "ready",
                label: "Ready",
                content: <p>Recorded content</p>,
                isEmpty: false,
                empty,
              },
              { id: "empty", label: "Empty", content: null, isEmpty: true, empty },
            ]}
          />
        </Case>
        <Case title="Evidence-backed story">
          <PresentStory
            title="Fixture findings"
            dataContext={context}
            findings={[
              {
                id: "zero",
                headline: "A measured zero is still evidence",
                context: "Use arrows to navigate; Escape exits.",
                visual: (
                  <MetricWidget label="Measured count" value={0} format={{ kind: "count" }} />
                ),
                evidence,
              },
              {
                id: "mix",
                headline: "One category dominates the observed total",
                visual: (
                  <Breakdown total={100} items={[{ id: "a", label: "Leading", value: 90 }]} />
                ),
                evidence: { ...evidence, id: "story-mix" },
              },
            ]}
          />
        </Case>
      </Section>
      <Section id="chrome" title="Page chrome and typed controls">
        <Case title="Long page identity and scope">
          <AppHeader
            title="An intentionally long page title for constrained header layouts"
            scope={<AppScope organization="Long organization name" environment="development" />}
            description="Descriptions wrap below page identity and retain their own text hierarchy."
            toolbar={<IconButton icon="info" label="Header information" />}
          />
        </Case>
        <Case title="Page refresh and cancellation">
          <AppToolbar
            aria-label="Fixture page actions"
            refresh={{
              refreshing: status.kind === "updating",
              onRefresh: () => setStatus({ kind: "updating" }),
              onCancel: () => setStatus({ kind: "idle" }),
            }}
          />
        </Case>
        <Case title="Typed dimension, literal null and missing">
          <VariableBar aria-label="Typed fixture variables">
            <DimensionPicker
              filter={dimension}
              value={dimensionValue}
              onChange={setDimensionValue}
            />
          </VariableBar>
        </Case>
        <Case title="Page notice and delayed request feedback">
          <Button onClick={() => setNotice(!notice)}>
            {notice ? "Hide page notice" : "Show page notice"}
          </Button>
          <DataViewToast
            view={dataView}
            notice={notice ? "A page-level notice keeps the content in place." : undefined}
            onRetry={() => setRequest("ready")}
          />
        </Case>
        <Case title="Footer with custom attribution">
          <AppFooter attribution={<span>Fixture attribution</span>}>
            <Button variant="ghost">Footer action</Button>
          </AppFooter>
        </Case>
        <Case title="Semantic icon inventory">
          <div className="gallery-wrap">
            {(
              [
                "cancel",
                "calendar",
                "clock",
                "check",
                "disclosure",
                "previousMonth",
                "nextMonth",
                "explore",
                "inspect",
                "info",
                "openDetails",
                "present",
                "error",
                "close",
                "previous",
                "next",
                "lightTheme",
                "darkTheme",
                "live",
                "loading",
                "refresh",
                "stop",
                "reset",
                "search",
                "copy",
                "sql",
                "wrap",
                "trendDown",
                "trendFlat",
                "trendUp",
              ] satisfies AppIconName[]
            ).map((name) => (
              <span key={name} title={name}>
                <AppIcon name={name} />
              </span>
            ))}
          </div>
        </Case>
      </Section>
      <Section id="layout" title="Layout, scrolling and constrained composition">
        <Case title="Narrow widget with long title, description, count and action">
          <div style={{ maxWidth: 260 }}>
            <DataWidget
              title="A long widget title wraps within its own column"
              count={1234567}
              description="Long supporting copy wraps beneath the title."
              action={<IconButton icon="refresh" label="Refresh narrow widget" />}
              status={widgetStatus}
            >
              <p>Content remains within the card.</p>
            </DataWidget>
          </div>
        </Case>
        <Case title="Grid spans and stacks">
          <Grid columns={3}>
            <GridItem span={2}>
              <StatusPanel status="empty" title="Spanning two columns" />
            </GridItem>
            <GridItem>
              <Stack>
                <p>Stack one</p>
                <p>Stack two</p>
              </Stack>
            </GridItem>
          </Grid>
        </Case>
        <Case title="Scroll gradients">
          <GradientScroll style={{ maxHeight: 120 }}>
            {Array.from({ length: 20 }, (_, i) => (
              <p key={i}>Scrollable line {i + 1}</p>
            ))}
          </GradientScroll>
        </Case>
      </Section>
    </>
  );
}
