import { useState, type ComponentProps, type ReactNode } from "react";
import { createThemeController } from "../../appearance.ts";
import type { DisclosedQuery } from "../../contract.ts";
import type { DataAppConfig } from "../../config.ts";
import { AboutData } from "../inspect/AboutData.tsx";
import { AppHeader } from "./AppHeader.tsx";
import { AppLayout } from "./AppLayout.tsx";
import { AppScope } from "./AppScope.tsx";
import { AppToolbar, type AppToolbarProps } from "./AppToolbar.tsx";
import type { DataContext } from "../inspect/data-context.ts";
import type { PlayStoryProps } from "../presentation/PlayStory.tsx";
import { ThemeToggle } from "./ThemeSelector.tsx";

export type DataAppProps = {
  config: DataAppConfig;
  dataContext: DataContext;
  children: ReactNode;
  description?: ReactNode;
  /** One `useDataView` result supplies query evidence and refresh controls. */
  request?: { queries?: DisclosedQuery[]; refresh?: AppToolbarProps["refresh"] };
  queries?: DisclosedQuery[];
  refresh?: AppToolbarProps["refresh"];
  filters?: ReactNode;
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
  children,
  description,
  request,
  queries,
  refresh,
  filters,
  story,
  toolbarActions,
  footerActions,
  layoutProps,
}: DataAppProps) {
  const [theme] = useState(() => createThemeController(config.appearance));
  const scope = (
    <AppScope organization={config.scope.organization} environment={config.scope.environment} />
  );
  return (
    <AppLayout {...layoutProps} footerActions={footerActions ?? <ThemeToggle theme={theme} />}>
      <AppHeader
        scope={scope}
        title={config.title}
        description={description}
        toolbar={
          <AppToolbar
            filters={filters}
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
      {children}
    </AppLayout>
  );
}
