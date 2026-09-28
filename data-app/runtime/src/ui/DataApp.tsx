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

export type DataAppProps = {
  config: DataAppConfig;
  dataContext: DataContext;
  aboutEmpty: AboutEmpty;
  children: ReactNode;
  description?: ReactNode;
  /** Display names only; config.scope remains the connection identity. */
  scopeLabels?: { organization?: string; environment?: string };
  /** One `useDataView` result supplies query evidence and refresh controls. */
  request?: {
    view: DataView<unknown, unknown>;
    queries?: DisclosedQuery[];
    refresh?: AppToolbarProps["refresh"];
  };
  queries?: DisclosedQuery[];
  refresh?: AppToolbarProps["refresh"];
  variables?: ReactNode;
  story?: Omit<PlayStoryProps, "title" | "dataContext"> &
    Partial<Pick<PlayStoryProps, "title" | "dataContext">>;
  toolbarActions?: ReactNode;
  footerActions?: ReactNode;
  layoutProps?: Omit<ComponentProps<typeof AppLayout>, "children" | "footerActions">;
};

/** Standard page identity, inspect sheet, controls, and viewer theme. Pass a
 * `useDataView` result as `request`, or supply queries and refresh separately. A story only
 * needs authored steps; title, scope, context, and theme default to this page. */
export function DataApp({
  config,
  dataContext,
  aboutEmpty,
  children,
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
}: DataAppProps) {
  const [theme] = useState(() => createThemeController(config.appearance));
  const scope = (
    <AppScope
      organization={scopeLabels?.organization ?? config.scope.organization}
      environment={scopeLabels?.environment ?? config.scope.environment}
    />
  );
  return (
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
      {variables && <VariableBar>{variables}</VariableBar>}
      {children}
    </AppLayout>
  );
}
