import { useState, type ComponentProps, type ReactNode } from "react";
import { createThemeController } from "../appearance.ts";
import type { DisclosedQuery } from "../contract.ts";
import type { DataAppConfig } from "../config.ts";
import type { DataView } from "./DataBoundary.tsx";
import { AboutData, type AboutEmpty } from "./AboutData.tsx";
import { AppHeader } from "./AppHeader.tsx";
import { AppLayout } from "./AppLayout.tsx";
import { AppScope } from "./AppScope.tsx";
import { AppToolbar, type AppToolbarProps } from "./AppToolbar.tsx";
import type { DataContext } from "./data-context.ts";
import type { PlayStoryProps } from "./PlayStory.tsx";
import { ThemeToggle } from "./ThemeSelector.tsx";
import { VariableBar } from "./VariableBar.tsx";
import { DataViewToast } from "./DataViewToast.tsx";
import { InspectionContext } from "./InspectionContext.tsx";
import { DataSection } from "./DataSection.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";

type DataAppBaseProps = {
  config: DataAppConfig;
  dataContext: DataContext;
  aboutEmpty: AboutEmpty;
  description?: ReactNode;
  /** Display names only; config.scope remains the connection identity. */
  scopeLabels?: { organization?: string; environment?: string };
  variables?: ReactNode;
  story?: Omit<PlayStoryProps, "title" | "dataContext" | "empty"> &
    Partial<Pick<PlayStoryProps, "title" | "dataContext" | "empty">>;
  toolbarActions?: ReactNode;
  footerActions?: ReactNode;
  layoutProps?: Omit<ComponentProps<typeof AppLayout>, "children" | "footerActions">;
};

export type DataAppRequest<Data, Input> = {
  view: DataView<Data, Input>;
  refetch: () => unknown;
  queries?: DisclosedQuery[];
  refresh?: AppToolbarProps["refresh"];
  empty?: Pick<EmptyStateProps, "title" | "description">;
  controls?: ReactNode;
};

export type DataAppProps<Data = unknown, Input = unknown> = DataAppBaseProps &
  (
    | ({
        request: DataAppRequest<Data, Input>;
        children: (data: Data, displayedInput: Input) => ReactNode;
        loading?: ReactNode;
        empty?: Pick<EmptyStateProps, "title" | "description">;
        label?: string;
        queries?: never;
        refresh?: never;
      } & (
        | {
            request: DataAppRequest<Data, Input> & {
              empty: Pick<EmptyStateProps, "title" | "description">;
            };
          }
        | { empty: Pick<EmptyStateProps, "title" | "description"> }
      ))
    | {
        request?: never;
        children: ReactNode;
        queries?: DisclosedQuery[];
        refresh?: AppToolbarProps["refresh"];
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
    variables,
    story,
    toolbarActions,
    footerActions,
    layoutProps,
  } = props;
  const [theme] = useState(() => createThemeController(config.appearance));
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
                  title: story.title ?? config.title,
                  scope: story.scope ?? scope,
                  dataContext: story.dataContext ?? dataContext,
                  empty: story.empty ?? aboutEmpty,
                  theme: story.theme ?? theme,
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
        {(variables ?? request?.controls) && (
          <VariableBar>{variables ?? request?.controls}</VariableBar>
        )}
        {request ? (
          <DataSection
            result={request}
            notice="none"
            loading={props.loading}
            empty={props.empty ?? request.empty!}
            label={props.label}
          >
            {(data, displayedInput) => props.children(data, displayedInput)}
          </DataSection>
        ) : (
          props.children
        )}
        {request && <DataViewToast view={request.view} onRetry={() => void request.refetch()} />}
      </AppLayout>
    </InspectionContext>
  );
}
