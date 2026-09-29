import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useMergeRefs } from "@floating-ui/react";
import { AppIcon } from "./icons.ts";
import type { DisclosedQuery } from "../../core/contract.ts";
import type { DataContext, GlossaryEntry } from "./data-context.ts";
import { Button, type ButtonProps } from "./Button.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { Kbd } from "./Kbd.tsx";
import { QueryList } from "./QueryList.tsx";
import { searchParams, slug, subscribeSearch, writeSearch } from "./search.ts";
import { Sheet, type SheetDialogProps } from "./Sheet.tsx";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "./Tabs.tsx";
import { ariaKeyShortcuts, shortcuts, useShortcut } from "./shortcuts.ts";
import { Tooltip } from "./Tooltip.tsx";
import { useInspectionDefaults } from "./InspectionContext.tsx";
import "./AboutData.css";

export type AboutTab = "glossary" | "queries";
export type AboutEmpty = {
  glossary: { title: string; description?: string };
  queries: { title: string; description?: string };
};

export const defaultAboutEmpty: AboutEmpty = {
  glossary: { title: "No glossary terms for this view" },
  queries: { title: "SQL is not available for this view" },
};

export type AboutSubject = {
  empty?: AboutEmpty;
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  visual?: ReactNode;
  visualKind?: "metric" | "chart";
  dataContext?: DataContext;
  glossaryEntry?: GlossaryEntry;
  glossaryEntries?: GlossaryEntry[];
  glossaryIds?: string[];
  queries?: DisclosedQuery[];
  queryNames?: string[];
};

export type AboutDataProps = AboutSubject & {
  variant?: ButtonProps["variant"];
  iconOnly?: boolean;
  /**
   * Register the global inspect shortcut. Defaults on for existing toolbar triggers; local
   * triggers set false.
   */
  shortcut?: boolean;
  tooltip?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  portalRoot?: RefObject<HTMLElement | null>;
  sheetProps?: SheetDialogProps;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Initial inspect tab. While open, the URL's `tab` parameter tracks selection. */
  tab?: AboutTab;
  trigger?: boolean;
} & Omit<ComponentPropsWithRef<"button">, "children" | "title">;

function namedGlossaryEntries(
  dataContext: DataContext | undefined,
  ids: string[],
): GlossaryEntry[] {
  return ids.map((id) => {
    const entry = dataContext?.glossary[id];
    if (!entry) throw new Error(`Unknown glossary entry: ${id}.`);
    return entry;
  });
}

function listedGlossaryEntries({
  glossaryEntry,
  glossaryEntries,
  dataContext,
  glossaryIds,
}: AboutSubject): GlossaryEntry[] {
  if (glossaryEntries?.length) return glossaryEntries;
  if (glossaryEntry) return [glossaryEntry];
  if (glossaryIds) return namedGlossaryEntries(dataContext, glossaryIds);
  return Object.values(dataContext?.glossary ?? {});
}

function glossaryQueries(subject: AboutSubject): string[] | undefined {
  if (subject.queryNames?.length) return subject.queryNames;
  const names = listedGlossaryEntries(subject).flatMap((item) => item.queryNames ?? []);
  return names.length ? names : undefined;
}

function subjectId({ id, title }: AboutSubject): string {
  if (id) return id;
  return typeof title === "string" ? slug(title) : "data";
}

function GlossaryDetail({ entry }: { entry: GlossaryEntry }) {
  return (
    <article className="altertable-about-glossary-entry">
      <h3>{entry.term}</h3>
      {entry.definition ? <p>{entry.definition}</p> : null}
    </article>
  );
}

function resolveTab(tab: string | null | undefined): AboutTab {
  return tab === "queries" ? "queries" : "glossary";
}

/**
 * Open state uses `?about=`; tab selection uses `?tab=`. Enable the global shortcut only on the
 * page-level trigger.
 */
export function AboutData({
  id,
  title,
  description,
  visual,
  visualKind,
  variant,
  dataContext,
  glossaryEntry,
  glossaryEntries,
  glossaryIds,
  queries,
  queryNames,
  empty,
  iconOnly = false,
  shortcut = true,
  tooltip,
  children,
  footer,
  portalRoot,
  sheetProps,
  open: openProp,
  onOpenChange,
  tab,
  trigger = true,
  className,
  onClick,
  ref,
  ...props
}: AboutDataProps) {
  const defaults = useInspectionDefaults();
  const resolvedContext = dataContext ?? defaults?.dataContext;
  const resolvedQueries = queries ?? defaults?.queries;
  const resolvedEmpty = empty ?? defaults?.empty ?? defaultAboutEmpty;
  const subject = {
    id,
    title,
    description,
    visual,
    dataContext: resolvedContext,
    glossaryEntry,
    glossaryEntries,
    glossaryIds,
    queries: resolvedQueries,
    queryNames,
    empty: resolvedEmpty,
  };
  const listed = listedGlossaryEntries(subject);
  const names = glossaryQueries(subject);
  if (names && resolvedQueries?.length) {
    for (const name of names) {
      if (!resolvedQueries.some((query) => query.name === name))
        throw new Error(`Unknown query name: ${name}.`);
    }
  }
  const hasQueries = (resolvedQueries ?? []).some((query) => !names || names.includes(query.name));
  const sheetId = subjectId(subject);
  const initialTab = resolveTab(tab ?? searchParams().get("tab"));
  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    () => searchParams().get("about") === sheetId,
  );
  const [selectedTab, setSelectedTab] = useState(initialTab);
  const open = openProp ?? uncontrolledOpen;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mergedTrigger = useMergeRefs([triggerRef, ref]);
  const heading = title ?? "About the data";
  const summary =
    description ?? resolvedContext?.description ?? "Glossary and queries for this view.";
  const shortcutEnabled = trigger && shortcut && !props.disabled;
  const hint =
    tooltip ??
    (iconOnly && shortcutEnabled ? (
      <>
        Explore data <Kbd shortcut={shortcuts.aboutData} />
      </>
    ) : (
      "Explore data"
    ));
  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
    if (next)
      writeSearch(
        { about: sheetId, tab: selectedTab },
        searchParams().get("about") === sheetId ? "replace" : "push",
      );
    else if (searchParams().get("about") === sheetId) writeSearch({ about: null, tab: null });
  }
  function selectTab(next: string | number) {
    const id = resolveTab(String(next));
    setSelectedTab(id);
    if (open) writeSearch({ about: sheetId, tab: id });
  }
  useEffect(() => {
    function sync() {
      const about = searchParams().get("about");
      const urlTab = searchParams().get("tab");
      if (about === sheetId) {
        if (openProp === undefined) setUncontrolledOpen(true);
        if (urlTab) setSelectedTab(resolveTab(urlTab));
        onOpenChange?.(true);
      } else if (openProp === undefined) {
        setUncontrolledOpen(false);
      }
    }
    return subscribeSearch(sync);
  }, [sheetId, openProp, onOpenChange]);
  useShortcut(shortcuts.aboutData, () => setOpen(true), shortcutEnabled);
  const triggerButton = (
    <Button
      {...props}
      ref={mergedTrigger}
      variant={variant}
      size={iconOnly ? "icon" : "default"}
      className={className}
      data-open={open || undefined}
      aria-label={
        props["aria-label"] ??
        (iconOnly
          ? title && typeof title === "string"
            ? `Explore ${title}`
            : "Explore data"
          : undefined)
      }
      aria-keyshortcuts={
        props["aria-keyshortcuts"] ??
        (shortcutEnabled ? ariaKeyShortcuts(shortcuts.aboutData) : undefined)
      }
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      }}
    >
      {children ?? (
        <>
          <AppIcon name="info" />
          {!iconOnly && "Explore details"}
        </>
      )}
    </Button>
  );

  return (
    <>
      {trigger ? (
        <Tooltip content={hint} portalRoot={portalRoot}>
          {triggerButton}
        </Tooltip>
      ) : null}
      <Sheet
        {...sheetProps}
        open={open}
        onOpenChange={setOpen}
        title={heading}
        description={summary}
        wide={!!visual && visualKind !== "metric"}
        returnFocus={triggerRef}
        footer={footer}
      >
        {visual && (
          <div className="altertable-about-visual" data-kind={visualKind}>
            {visual}
          </div>
        )}
        <div className="altertable-about-body">
          <Tabs
            selectedKey={selectedTab}
            onSelectionChange={selectTab}
            className="altertable-about-tabs"
          >
            <div className="altertable-about-tabbar">
              <TabList aria-label={typeof heading === "string" ? heading : "About the data"}>
                <Tab id="glossary">Glossary</Tab>
                <Tab id="queries">Queries</Tab>
              </TabList>
            </div>
            <TabPanels>
              <TabPanel id="glossary">
                {listed.length ? (
                  <div className="altertable-about-glossary-list">
                    {listed.map((entry) => (
                      <GlossaryDetail key={entry.term} entry={entry} />
                    ))}
                  </div>
                ) : (
                  <EmptyState {...resolvedEmpty.glossary} />
                )}
              </TabPanel>
              <TabPanel id="queries">
                {hasQueries ? (
                  <QueryList queries={resolvedQueries} names={names} expanded />
                ) : (
                  <EmptyState {...resolvedEmpty.queries} />
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </Sheet>
    </>
  );
}
