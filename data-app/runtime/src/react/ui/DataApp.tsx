import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createThemeController } from "../../core/appearance.ts";
import type { DisclosedQuery } from "../../core/contract.ts";
import type { DataAppConfig } from "../../core/config.ts";
import { displayedSnapshot } from "../../core/data-view.ts";
import { AboutData, type AboutEmpty } from "./AboutData.tsx";
import { AppHeader } from "./AppHeader.tsx";
import { AppLayout } from "./AppLayout.tsx";
import { AppScope } from "./AppScope.tsx";
import { AppToolbar, type AppToolbarProps } from "./AppToolbar.tsx";
import type { DataContext } from "./data-context.ts";
import type { BoundStory } from "./story.ts";
import { ThemeToggle } from "./ThemeSelector.tsx";
import { VariableBar } from "./VariableBar.tsx";
import { DataViewToast } from "./DataViewToast.tsx";
import { InspectionContext } from "./InspectionContext.tsx";
import { DataSection, type SectionResult } from "./DataSection.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";

type DataAppBaseProps = {
  config: DataAppConfig;
  dataContext: DataContext;
  aboutEmpty?: AboutEmpty;
  description?: ReactNode;
  /** Display names only; config.scope remains the connection identity. */
  scopeLabels?: { organization?: string; environment?: string };
  toolbarActions?: ReactNode;
  footerActions?: ReactNode;
  layoutProps?: Omit<ComponentProps<typeof AppLayout>, "children" | "footerActions">;
};

export type DataAppRequest<Data, Input> = SectionResult<Data, Input> & {
  queries?: DisclosedQuery[];
  refresh?: AppToolbarProps["refresh"];
  empty: Pick<EmptyStateProps, "title" | "description">;
  controls?: ReactNode;
};

export type DataAppProps<Data = unknown, Input = unknown> = DataAppBaseProps &
  (
    | {
        request: DataAppRequest<Data, Input>;
        /** Findings are always derived from the result currently visible to the reader. */
        story?: BoundStory<Data, Input>;
        children: (data: Data, displayedInput: Input) => ReactNode;
        loading?: ReactNode;
        label?: string;
        queries?: never;
        refresh?: never;
        variables?: never;
      }
    | {
        request?: never;
        story?: never;
        children: ReactNode;
        queries?: DisclosedQuery[];
        refresh?: AppToolbarProps["refresh"];
        variables?: ReactNode;
        loading?: never;
        empty?: never;
        label?: never;
      }
  );

/** The primary request owns the page's result, period, refresh status, and inspection context.
 * Without a request, the shell accepts authored children for setup or static views. */
export function DataApp<Data, Input>(props: DataAppProps<Data, Input>) {
  const {
    config,
    dataContext,
    aboutEmpty,
    description,
    scopeLabels,
    request,
    queries,
    refresh,
    toolbarActions,
    footerActions,
    layoutProps,
  } = props;
  const [theme] = useState(() => createThemeController(config.appearance));
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (import.meta.env?.DEV && bodyRef.current?.querySelector("h1"))
      console.warn("DataApp owns the page title. Use section headings (h2) in its body.");
  });
  const snapshot = request && displayedSnapshot(request.view);
  const story =
    request && props.story && snapshot ? { findings: props.story(snapshot) } : undefined;
  const scope = (
    <AppScope
      organization={scopeLabels?.organization ?? config.scope.organization}
      environment={scopeLabels?.environment ?? config.scope.environment}
    />
  );
  return (
    <InspectionContext
      value={{ dataContext, empty: aboutEmpty, queries: queries ?? request?.queries }}
    >
      <AppLayout {...layoutProps} footerActions={footerActions ?? <ThemeToggle theme={theme} />}>
        <AppHeader
          scope={scope}
          title={config.title}
          description={description}
          toolbar={
            <AppToolbar
              requestState={request?.view.kind}
              refresh={refresh ?? request?.refresh}
              story={
                story && {
                  ...story,
                  title: config.title,
                  scope,
                  dataContext,
                  empty: aboutEmpty,
                  theme,
                }
              }
              aboutData={
                <AboutData
                  id="data"
                  shortcut
                  dataContext={dataContext}
                  empty={aboutEmpty}
                  queries={queries ?? request?.queries}
                  iconOnly
                  variant="elevated"
                />
              }
            >
              {toolbarActions}
            </AppToolbar>
          }
        />
        {(request?.controls ?? props.variables) && (
          <VariableBar>{request?.controls ?? props.variables}</VariableBar>
        )}
        <div ref={bodyRef} className="altertable-app-body">
          {request ? (
            <DataSection
              result={request}
              notice="none"
              dimOnUpdate={false}
              loading={props.loading}
              empty={request.empty}
              label={props.label}
            >
              {(data, displayedInput) => props.children(data, displayedInput)}
            </DataSection>
          ) : (
            props.children
          )}
        </div>
        {request && <DataViewToast view={request.view} onRetry={() => void request.refetch()} />}
      </AppLayout>
    </InspectionContext>
  );
}
