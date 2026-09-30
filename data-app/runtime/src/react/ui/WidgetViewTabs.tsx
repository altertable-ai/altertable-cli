import type { ComponentPropsWithRef, ReactNode } from "react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "./Tabs.tsx";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import { classNames } from "./classNames.ts";
import { validateWidgetViews } from "./widget-views.ts";
import "./WidgetViewTabs.css";

export type WidgetView = {
  id: string;
  label: ReactNode;
  content: ReactNode;
  empty: Pick<EmptyStateProps, "title" | "description">;
  isEmpty: boolean;
};
export type WidgetViewTabsProps<Views extends readonly WidgetView[] = readonly WidgetView[]> = {
  label: string;
  views: Views;
  selectedKey: NoInfer<Views[number]["id"]>;
  onSelectionChange: (key: Views[number]["id"]) => void;
} & Omit<ComponentPropsWithRef<"div">, "children">;

export function WidgetViewTabs<const Views extends readonly WidgetView[]>({
  label,
  views,
  selectedKey,
  onSelectionChange,
  className,
  ...props
}: WidgetViewTabsProps<Views>) {
  validateWidgetViews(views, selectedKey);
  return (
    <div {...props} className={classNames("altertable-widget-view-tabs", className)}>
      <Tabs selectedKey={selectedKey} onSelectionChange={(key) => onSelectionChange(String(key))}>
        <TabList aria-label={label}>
          {views.map((view) => (
            <Tab key={view.id} id={view.id}>
              {view.label}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          {views.map((view) => (
            <TabPanel key={view.id} id={view.id}>
              {view.isEmpty ? <EmptyState {...view.empty} /> : view.content}
            </TabPanel>
          ))}
        </TabPanels>
      </Tabs>
    </div>
  );
}
