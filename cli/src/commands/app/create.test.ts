import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import { upgradeApp } from "@/commands/app/upgrade.ts";
import {
  currentRuntimeIntegrity,
  installedRuntimeIntegrity,
  readRuntimeTemplates,
} from "@/commands/app/lib/runtime.ts";
import { configSet, ensureProfileExists, setActiveProfile } from "@/lib/profile-store.ts";

let home: string;
let previousConfigHome: string | undefined;
let previousProfile: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "altertable-app-create-"));
  previousConfigHome = process.env.ALTERTABLE_CONFIG_HOME;
  previousProfile = process.env.ALTERTABLE_PROFILE;
  process.env.ALTERTABLE_CONFIG_HOME = home;
  delete process.env.ALTERTABLE_PROFILE;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (previousConfigHome === undefined) delete process.env.ALTERTABLE_CONFIG_HOME;
  else process.env.ALTERTABLE_CONFIG_HOME = previousConfigHome;
  if (previousProfile === undefined) delete process.env.ALTERTABLE_PROFILE;
  else process.env.ALTERTABLE_PROFILE = previousProfile;
});

describe("app create", () => {
  test("creates a self-contained project without a configured profile", async () => {
    const directory = join(home, "product-pulse");
    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "product-pulse",
      "--dir",
      directory,
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      name: "product-pulse",
      directory,
      scope: { organization: "Your organization", environment: "your environment" },
      scopeSource: "placeholder",
      nextSteps: ["altertable app dev", "altertable app check", "altertable app build"],
    });
    expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))).toMatchObject({
      name: "product-pulse",
      scripts: {
        typecheck: "tsc --noEmit",
        lint: "oxlint --type-aware src",
        format: "oxfmt src",
        "format:check": "oxfmt --check src",
        dev: "bun --hot src/server.ts",
      },
    });
    expect(readFileSync(join(directory, "bun.lock"), "utf8")).toContain('"name": "product-pulse"');
    expect(readFileSync(join(directory, "bunfig.toml"), "utf8")).toContain("exact = true");
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("title={app.title}");
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("evidence={{");
    expect(readFileSync(join(directory, "src/operations.ts"), "utf8")).toContain("defineOperation");
    expect(readFileSync(join(directory, "src/methodology.ts"), "utf8")).toContain("subject:");
    expect(readFileSync(join(directory, "src/analysis.ts"), "utf8")).toContain("analyzeTables");
    const appGuide = readFileSync(join(directory, "AGENTS.md"), "utf8");
    expect(appGuide).toContain("Working on Product Pulse");
    expect(appGuide).toContain("## Start with evidence");
    expect(appGuide).toContain("## Files and data flow");
    expect(appGuide).toContain("## Compose the view");
    expect(appGuide).toContain("## Verify and maintain");
    expect(appGuide).toContain("source tables, row grain, population, timezone");
    expect(appGuide).toContain("dynamic, source-bounded date range");
    expect(appGuide).toContain("measured zero in the ready state");
    expect(appGuide).toContain("altertable app check --lakehouse");
    expect(appGuide).toContain("Edit `src/`, not generated runtime files");
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/AppToolbar.tsx"), "utf8"),
    ).toContain("altertable-app-toolbar-actions");
    expect(readFileSync(join(directory, ".altertable/runtime/ui/Tooltip.tsx"), "utf8")).toContain(
      'variant?: "hint" | "chart"',
    );
    expect(readFileSync(join(directory, ".altertable/runtime/ui/Tooltip.tsx"), "utf8")).toContain(
      "followCursor",
    );
    expect(appGuide).toContain("ClaimEvidence");
    expect(appGuide).toContain("altertable.ai/docs/query-data/mcp");
    expect(appGuide).toContain("altertable login --org");
    expect(appGuide).toContain("altertable profile switch");
    expect(readFileSync(join(directory, "src/analysis.ts"), "utf8")).toContain("ClaimEvidence");
    expect(readFileSync(join(directory, ".altertable/runtime/ui/PlayStory.tsx"), "utf8")).toContain(
      "portalRoot={dialog}",
    );
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("AppHeader");
    expect(readFileSync(join(directory, "src/main.tsx"), "utf8")).toContain("DataAppProvider");
    expect(readFileSync(join(directory, "src/operations.ts"), "utf8")).not.toContain("evidence:");
    expect(readFileSync(join(directory, ".altertable/runtime/local.ts"), "utf8")).toContain(
      "ALTERTABLE_LAKEHOUSE_PASSWORD",
    );
    expect(existsSync(join(directory, ".altertable/runtime/ui/AboutData.tsx"))).toBe(true);
    expect(existsSync(join(directory, ".altertable/runtime/ui/Sheet.tsx"))).toBe(true);
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AboutData.tsx"), "utf8")).toContain(
      "<Tooltip content=",
    );
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AboutData.tsx"), "utf8")).toContain(
      'id="queries"',
    );
    expect(existsSync(join(directory, ".altertable/runtime/ui/MeasureExplanation.tsx"))).toBe(true);
    expect(existsSync(join(directory, ".altertable/runtime/ui/AltertableLogo.tsx"))).toBe(true);
    expect(existsSync(join(directory, ".altertable/runtime/ui/ThemeSelector.tsx"))).toBe(true);
    for (const name of [
      "AppLayout",
      "Grid",
      "MetricCard",
      "VisualizationCard",
      "TableCard",
      "DataSection",
      "Breakdown",
      "Ranking",
      "DataPanel",
      "StatusPanel",
      "Skeleton",
    ]) {
      expect(existsSync(join(directory, `.altertable/runtime/ui/${name}.tsx`))).toBe(true);
    }
    expect(existsSync(join(directory, ".altertable/runtime/ui/AppToolbar.tsx"))).toBe(true);
    for (const name of [
      "Button",
      "ClaimProvenance",
      "AboutData",
      "PlayStory",
      "Tabs",
      "DateRangePicker",
      "DateTimeTooltip",
      "SearchField",
      "Combobox",
      "HelpPopover",
      "UpdatedAt",
      "RefreshRegion",
      "RefreshControl",
      "AppHeader",
      "Tooltip",
      "DataBoundary",
      "ContentSkeleton",
    ]) {
      expect(existsSync(join(directory, `.altertable/runtime/ui/${name}.tsx`))).toBe(true);
    }
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("AppToolbar");
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("<DataSection");
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("<TableCard");
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/DataSection.tsx"), "utf8"),
    ).toContain("ContentSkeleton");
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).not.toContain(
      "Loading available tables",
    );
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("story={{");
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AboutData.tsx"), "utf8")).toContain(
      "AboutSubject",
    );
    expect(readFileSync(join(directory, "src/index.html"), "utf8")).toContain(
      "Product Pulse • Your organization/your environment • Altertable app",
    );
    expect(readFileSync(join(directory, "src/main.tsx"), "utf8")).toContain("• Altertable app");
    expect(existsSync(join(directory, ".oxfmtrc.json"))).toBe(true);
    expect(existsSync(join(directory, ".altertable/runtime/ui/search.ts"))).toBe(true);
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AboutData.tsx"), "utf8")).toContain(
      "writeSearch({ about:",
    );
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AboutData.tsx"), "utf8")).toContain(
      '<Tab id="measures">Measures</Tab>',
    );
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AboutData.tsx"), "utf8")).toContain(
      '<Tab id="overview">Overview</Tab>',
    );
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/MetricCard.tsx"), "utf8"),
    ).toContain("Explore this metric");
    expect(readFileSync(join(directory, ".altertable/runtime/ui/QueryList.tsx"), "utf8")).toContain(
      "formatSql",
    );
    expect(readFileSync(join(directory, "src/index.html"), "utf8")).toContain(
      'href="./favicon.svg"',
    );
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AppLayout.css"), "utf8")).toContain(
      ".altertable-sr-only",
    );
    expect(readFileSync(join(directory, ".altertable/runtime/ui/AppLayout.css"), "utf8")).toContain(
      "min-height: 100dvh",
    );
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/AppToolbar.tsx"), "utf8"),
    ).toContain('<AppIcon name="refresh"');
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/AppToolbar.tsx"), "utf8"),
    ).not.toContain("altertable-app-toolbar-rule");
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/IconButton.tsx"), "utf8"),
    ).toContain("aria-keyshortcuts");
    expect(readFileSync(join(directory, "src/favicon.svg"), "utf8")).toContain(
      'viewBox="0 0 51 44"',
    );
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/DateRangePicker.tsx"), "utf8"),
    ).not.toContain("I18nProvider");
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/DateRangePicker.tsx"), "utf8"),
    ).toContain("onPresetChange");
    expect(readFileSync(join(directory, ".altertable/runtime/ui/variables.ts"), "utf8")).toContain(
      "useAppVariables",
    );
    expect(readFileSync(join(directory, "src/variables.ts"), "utf8")).toContain(
      "defineAppVariables",
    );
    expect(readFileSync(join(directory, ".altertable/runtime/ui/Sheet.css"), "utf8")).toContain(
      "min(960px, 100vw)",
    );
    expect(
      readFileSync(join(directory, ".altertable/runtime/ui/ThemeSelector.tsx"), "utf8"),
    ).not.toContain('label: "System"');
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).not.toContain(
      "ALTERTABLE_LAKEHOUSE_PASSWORD",
    );
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain(
      'useDataQuery("tables", tableInput(appVariables.values))',
    );
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8"))).toMatchObject({
      schemaVersion: 1,
      operations: { tables: {} },
    });
    expect(
      JSON.parse(readFileSync(join(directory, ".altertable/runtime/integrity.json"), "utf8")),
    ).toMatchObject({ version: currentRuntimeIntegrity().version });
    expect(existsSync(join(directory, ".gitignore"))).toBe(true);
  });

  test("selected profile seeds the manifest and reports its scope to agents", async () => {
    ensureProfileExists("altertable_production");
    configSet("organization_slug", "altertable", "altertable_production");
    configSet("organization_name", "Altertable", "altertable_production");
    configSet("api_key_env", "production", "altertable_production");
    const directory = join(home, "profiled-app");

    const result = await runCommandWithTestRuntime(
      ["app", "create", "profiled-app", "--dir", directory],
      { debug: false, json: false, agent: true, profile: "altertable_production" },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "Altertable", environment: "production" },
      scopeSource: "profile",
      profile: "altertable_production",
      organizationSlug: "altertable",
      nextSteps: [
        "altertable --profile altertable_production app dev",
        "altertable --profile altertable_production app check",
        "altertable --profile altertable_production app build",
      ],
    });
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8"))).toMatchObject({
      scope: { organization: "Altertable", environment: "production" },
    });
    expect(readFileSync(join(directory, "src/index.html"), "utf8")).toContain(
      "Profiled App • Altertable/production • Altertable app",
    );
  });

  test("a complete active profile seeds scope without an extra flag", async () => {
    ensureProfileExists("current");
    configSet("organization_slug", "cousteau", "current");
    configSet("organization_name", "Cousteau", "current");
    configSet("api_key_env", "production", "current");
    setActiveProfile("current");
    const directory = join(home, "active-app");

    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "active-app",
      "--dir",
      directory,
    ]);

    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "Cousteau", environment: "production" },
      scopeSource: "profile",
      profile: "current",
    });
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8")).scope).toEqual({
      organization: "Cousteau",
      environment: "production",
    });
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).toContain("title={app.title}");
    expect(readFileSync(join(directory, "src/App.tsx"), "utf8")).not.toContain("{{APP_TITLE}}");
  });

  test("without-profile keeps offline scaffolding available with an active profile", async () => {
    ensureProfileExists("current");
    configSet("organization_slug", "cousteau", "current");
    configSet("api_key_env", "production", "current");
    setActiveProfile("current");
    const directory = join(home, "offline-app");

    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "offline-app",
      "--dir",
      directory,
      "--without-profile",
    ]);

    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "Your organization", environment: "your environment" },
      scopeSource: "placeholder",
    });
  });

  test("a partially configured active profile stops before writing", async () => {
    ensureProfileExists("current");
    configSet("organization_slug", "cousteau", "current");
    setActiveProfile("current");
    const directory = join(home, "partial-app");

    let failure: unknown;
    try {
      await runCommandWithTestRuntime(["app", "create", "partial-app", "--dir", directory]);
    } catch (error) {
      failure = error;
    }
    expect((failure as Error).message).toContain("needs an organization and environment");
    expect(existsSync(directory)).toBe(false);
  });

  test("profile display names are escaped for each generated file format", async () => {
    ensureProfileExists("special");
    configSet("organization_slug", "acme", "special");
    configSet("organization_name", 'Acme "North" & Co', "special");
    configSet("api_key_env", "production", "special");
    const directory = join(home, "special-app");

    const result = await runCommandWithTestRuntime(
      ["app", "create", "special-app", "--dir", directory],
      { debug: false, json: true, agent: false, profile: "special" },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(directory, "app.json"), "utf8")).scope.organization).toBe(
      'Acme "North" & Co',
    );
    expect(readFileSync(join(directory, "src/index.html"), "utf8")).toContain(
      "Acme &quot;North&quot; &amp; Co/production",
    );
  });

  test("from-profile uses the active profile and stops before writing if scope is incomplete", async () => {
    ensureProfileExists("current");
    setActiveProfile("current");
    const directory = join(home, "incomplete-app");

    let failure: unknown;
    try {
      await runCommandWithTestRuntime([
        "app",
        "create",
        "incomplete-app",
        "--dir",
        directory,
        "--from-profile",
      ]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("needs an organization and environment");
    expect(existsSync(directory)).toBe(false);

    configSet("organization_slug", "cousteau", "current");
    configSet("api_key_env", "staging", "current");
    const result = await runCommandWithTestRuntime([
      "app",
      "create",
      "incomplete-app",
      "--dir",
      directory,
      "--from-profile",
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({
      scope: { organization: "cousteau", environment: "staging" },
      profile: "current",
    });
  });

  test("checks a newly created app before dependencies were installed", async () => {
    const directory = join(home, "first-check");
    await runCommandWithTestRuntime(["app", "create", "first-check", "--dir", directory]);
    writeFileSync(
      join(directory, "src/composition.tsx"),
      `import {
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
  MeasureExplanation,
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
} from "@altertable/data-app-runtime/ui";
import type { AppToolbarProps, PlayStoryProps } from "@altertable/data-app-runtime/ui";

const toolbarProps = {
  refresh: { refreshing: false, onRefresh: () => {} },
} satisfies AppToolbarProps;
const storyProps = { title: "Story", steps: [] } satisfies PlayStoryProps;
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
      <MeasureExplanation measure={null!} className="measure" title="Signups" />
      <AboutData
        methodology={null!}
        className="method"
        tooltip="About the data"
        footer="More context"
        sheetProps={{ className: "details" }}
      >
        Method
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
`,
    );
    const result = await runCommandWithTestRuntime(["app", "check", "--dir", directory], {
      debug: false,
      json: false,
      agent: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("client bundle clean");
    writeFileSync(
      join(directory, "search-contract.test.tsx"),
      `import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { searchItems } from "./.altertable/runtime/ui/searchItems.ts";
import { SearchMatch } from "./.altertable/runtime/ui/SearchMatch.tsx";
import { ariaKeyShortcuts, shortcutLabel } from "./.altertable/runtime/ui/shortcuts.ts";
import { TableCard } from "./.altertable/runtime/ui/TableCard.tsx";
import { dateRangeControl, dateRangeVariable, defineAppVariables, selectVariable, textVariable } from "./.altertable/runtime/ui/variables.ts";
import { createDataClient, DataAppError } from "./.altertable/runtime/client.ts";
import { createDataHandler } from "./.altertable/runtime/server.ts";

test("local search preserves table order and highlights original text", () => {
  const rows = [
    { id: "first", name: "Café <table>", catalog: "prod" },
    { id: "second", name: "Cafe", catalog: "stage" },
  ];
  const attributes = [
    { name: "name", getter: (row: typeof rows[number]) => row.name },
    { name: "catalog", getter: (row: typeof rows[number]) => row.catalog },
  ] as const;
  const hits = searchItems(rows, "cafe prod", { attributes });
  expect(hits).toEqual([{ item: rows[0], score: 0, matches: {
    name: { text: rows[0]!.name, ranges: [{ start: 0, end: 4 }] },
    catalog: { text: "prod", ranges: [{ start: 0, end: 4 }] },
  } }]);
  expect(searchItems(rows, "", { attributes }).map(hit => hit.item.id)).toEqual(["first", "second"]);
  expect(searchItems(rows, "cafe", { attributes, mode: "fuzzy" })).toHaveLength(2);
  expect(renderToStaticMarkup(createElement(SearchMatch, {
    match: hits[0]!.matches.name,
  }))).toContain("<mark>Café</mark> &lt;table&gt;");
  const table = renderToStaticMarkup(createElement(TableCard, {
    title: "Results",
    columns: [
      { id: "name", header: "Name", cell: (hit: typeof hits[number]) => createElement(SearchMatch, { match: hit.matches.name }) },
      { id: "count", header: "Count", type: "number", cell: () => "12" },
    ],
    rows: hits,
    rowKey: (hit: typeof hits[number]) => hit.item.id,
  }));
  expect(table).toContain("<mark>Café</mark> &lt;table&gt;");
  expect(table).toMatch(/<th[^>]*data-type="number"[^>]*>Count<\\/th>/);
  expect(table).toMatch(/<td[^>]*data-type="number"[^>]*>12<\\/td>/);
});

test("shortcut labels and accessible keys include optional Shift", () => {
  const shortcut = { modifier: "alt", shift: true, code: "KeyK", key: "K" } as const;
  expect(["⌥⇧K", "Alt+Shift+K"]).toContain(shortcutLabel(shortcut));
  expect(ariaKeyShortcuts(shortcut)).toBe("Alt+Shift+K");
});

test("app variables validate URLs and keep date presets relative", () => {
  const definitions = defineAppVariables({
    search: textVariable({ key: "q" }),
    member: selectVariable({ key: "member", defaultValue: "all", values: ["all", "alice"] }),
  });
  expect(definitions.search.read(new URLSearchParams("q=build"))).toBe("build");
  expect(definitions.search.write("")).toEqual({ q: null });
  expect(definitions.member.read(new URLSearchParams("member=unknown"))).toBe("all");
  expect(() => defineAppVariables({ first: textVariable({ key: "q" }), second: textVariable({ key: "q" }) })).toThrow("duplicate URL key");

  let sourceEnd = "2020-01-07";
  const period = dateRangeVariable({
    key: "period", minDate: "2020-01-01", maxDate: () => sourceEnd,
    maxRangeDays: 7, timeZone: "UTC", defaultValue: { kind: "preset", id: "last-3" },
  });
  const selection = period.read(new URLSearchParams("period=last-3"));
  expect(period.resolve(selection)).toEqual({ start: "2020-01-05", end: "2020-01-07" });
  expect(period.write(selection)).toEqual({ period: null, start: null, end: null });
  sourceEnd = "2020-01-08";
  expect(period.resolve(selection)).toEqual({ start: "2020-01-06", end: "2020-01-08" });
  expect(period.read(new URLSearchParams("start=2020-01-06&end=2020-01-08"))).toEqual({
    kind: "dates", start: "2020-01-06", end: "2020-01-08",
  });
  expect(period.read(new URLSearchParams("period=last-90"))).toEqual(period.defaultValue);
  expect(dateRangeControl(period, selection, () => {}).value).toEqual({ start: "2020-01-06", end: "2020-01-08" });
});

test("operation routes decode one path segment and client errors remain useful", async () => {
  const operation = {
    input: (value: unknown) => value,
    output: (value: unknown) => value,
    run: async () => ({ count: 1 }),
    policy: { maxQueryRows: 1, maxDurationMs: 1000 },
  };
  const handler = createDataHandler({ "usage / team": operation }, async () => ({
    lakehouse: { queryAll: async () => ({ columns: [], rows: [] }) },
    canDiscloseSql: false,
  }));
  const response = await handler(new Request("http://localhost/api/data/usage%20%2F%20team", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  }));
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({ count: 1 });
  const client = createDataClient({ fetch: (async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch });
  await expect(client.query("usage", {})).rejects.toMatchObject({
    name: "DataAppError", code: "request_failed", message: "Could not load data.",
  });
  expect(DataAppError.name).toBe("DataAppError");
});
`,
    );
    const searchTest = Bun.spawnSync(["bun", "test", "search-contract.test.tsx"], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (searchTest.exitCode !== 0) throw new Error(searchTest.stderr.toString());
  });

  test("never overwrites an existing directory", async () => {
    const directory = join(home, "existing");
    const marker = join(directory, "keep.txt");
    await runCommandWithTestRuntime(["app", "create", "existing", "--dir", directory]);
    writeFileSync(marker, "keep");

    expect(
      runCommandWithTestRuntime(["app", "create", "existing", "--dir", directory]),
    ).rejects.toThrow("Directory already exists");
    expect(readFileSync(marker, "utf8")).toBe("keep");
  });

  test("rejects names that cannot safely become project names", async () => {
    for (const name of ["../outside", "Product Pulse", "product_pulse", "app-"]) {
      expect(
        runCommandWithTestRuntime(["app", "create", name, "--dir", join(home, "app")]),
      ).rejects.toThrow("lowercase kebab-case");
    }
    expect(existsSync(join(home, "app"))).toBe(false);
  });

  test("writes a concise human completion message", async () => {
    const directory = join(home, "first-app");
    const result = await runCommandWithTestRuntime(
      ["app", "create", "first-app", "--dir", directory],
      { debug: false, json: false, agent: false },
    );
    expect(result.stdout.join("\n")).toContain("From that directory, run altertable app dev.");
  });

  test("returns the created directory in agent output", async () => {
    const directory = join(home, "agent-app");
    const result = await runCommandWithTestRuntime(
      ["app", "create", "agent-app", "--dir", directory],
      { debug: false, json: false, agent: true },
    );
    expect(JSON.parse(result.stdout[0]!)).toMatchObject({ name: "agent-app", directory });
  });

  test("upgrade preserves app-owned changes and refuses a modified runtime", async () => {
    const directory = join(home, "upgrade-app");
    await runCommandWithTestRuntime(["app", "create", "upgrade-app", "--dir", directory]);
    const operations = join(directory, "src/operations.ts");
    writeFileSync(operations, `${readFileSync(operations, "utf8")}\n// App-specific change.\n`);
    const current = await runCommandWithTestRuntime(["app", "upgrade", "--dir", directory], {
      debug: false,
      json: false,
      agent: false,
    });
    expect(current.stdout.join("\n")).toContain("already current");
    expect(readFileSync(operations, "utf8")).toContain("App-specific change");

    const runtime = join(directory, ".altertable/runtime/server.ts");
    writeFileSync(runtime, `${readFileSync(runtime, "utf8")}\n// Local edit.\n`);
    expect(runCommandWithTestRuntime(["app", "upgrade", "--dir", directory])).rejects.toThrow(
      "was modified",
    );
    expect(readFileSync(runtime, "utf8")).toContain("Local edit");
  });

  test("template watch upgrade updates integrity and stops on generated edits", async () => {
    const directory = join(home, "watched-app");
    await runCommandWithTestRuntime(["app", "create", "watched-app", "--dir", directory]);
    const files = await readRuntimeTemplates();
    files["format.ts"] += "\n// Changed template.\n";
    expect(await upgradeApp(directory, { runtimeFiles: files })).toBe(true);
    expect(readFileSync(join(directory, ".altertable/runtime/format.ts"), "utf8")).toContain(
      "Changed template",
    );
    expect((await installedRuntimeIntegrity(directory)).sha256).toEqual(
      currentRuntimeIntegrity(files).sha256,
    );

    const generated = join(directory, ".altertable/runtime/format.ts");
    writeFileSync(generated, `${readFileSync(generated, "utf8")}\n// App edit.\n`);
    expect(upgradeApp(directory, { runtimeFiles: await readRuntimeTemplates() })).rejects.toThrow(
      "format.ts was modified",
    );
  });

  test("invalid lockfile leaves the installed runtime unchanged", async () => {
    const directory = join(home, "invalid-lock-app");
    await runCommandWithTestRuntime(["app", "create", "invalid-lock-app", "--dir", directory]);
    const integrityPath = join(directory, ".altertable/runtime/integrity.json");
    const integrity = JSON.parse(readFileSync(integrityPath, "utf8")) as { version: string };
    integrity.version = "0.1.0";
    writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`);
    const runtimePath = join(directory, ".altertable/runtime/server.ts");
    const beforeRuntime = readFileSync(runtimePath, "utf8");
    const beforeIntegrity = readFileSync(integrityPath, "utf8");
    const lockPath = join(directory, "bun.lock");
    const validLock = readFileSync(lockPath, "utf8");
    rmSync(lockPath);
    expect(upgradeApp(directory)).rejects.toThrow("valid bun.lock");
    expect(readFileSync(integrityPath, "utf8")).toBe(beforeIntegrity);
    writeFileSync(lockPath, "{ invalid lockfile");

    expect(upgradeApp(directory)).rejects.toThrow("valid bun.lock");
    expect(readFileSync(runtimePath, "utf8")).toBe(beforeRuntime);
    expect(readFileSync(integrityPath, "utf8")).toBe(beforeIntegrity);
    writeFileSync(lockPath, validLock);
    expect(await upgradeApp(directory)).toBe(true);
  });

  test("upgrade rolls back a failure after applying runtime files", async () => {
    const directory = join(home, "rollback-app");
    await runCommandWithTestRuntime(["app", "create", "rollback-app", "--dir", directory]);
    const integrityPath = join(directory, ".altertable/runtime/integrity.json");
    const integrity = JSON.parse(readFileSync(integrityPath, "utf8")) as { version: string };
    integrity.version = "0.1.0";
    writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`);
    const paths = [integrityPath, join(directory, "package.json"), join(directory, "bun.lock")];
    const before = paths.map((path) => readFileSync(path, "utf8"));

    expect(
      upgradeApp(directory, {
        afterApply(path) {
          if (path === join(directory, ".altertable/runtime"))
            throw new Error("Injected write failure");
        },
      }),
    ).rejects.toThrow("Injected write failure");
    expect(paths.map((path) => readFileSync(path, "utf8"))).toEqual(before);
    expect(await upgradeApp(directory)).toBe(true);
  });

  test("generated number formatting distinguishes counts and ratios", async () => {
    const directory = join(home, "format-app");
    await runCommandWithTestRuntime(["app", "create", "format-app", "--dir", directory]);
    const { formatNumber, formatCount, formatPercent } = await import(
      pathToFileURL(join(directory, ".altertable/runtime/format.ts")).href
    );

    expect(formatNumber(12.345, { maximumFractionDigits: 2 })).toBe("12.35");
    expect(formatNumber(-0)).toBe("0");
    expect(formatCount(12_345)).toBe("12,345");
    expect(formatCount(12_345, { compact: true })).toBe("12.3K");
    expect(formatCount(12.5)).toBe("—");
    expect(formatPercent(0.116)).toBe("11.6%");
    expect(formatPercent(0.0012)).toBe("0.12%");
    expect(formatPercent(0.00002)).toBe("<0.01%");
    expect(formatPercent(null)).toBe("—");
  });
});
