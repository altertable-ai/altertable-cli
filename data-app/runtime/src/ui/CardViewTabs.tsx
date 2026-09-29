import type { ComponentPropsWithRef, ReactNode } from "react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "./Tabs.tsx";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import { classNames } from "./classNames.ts";
import "./CardViewTabs.css";

export type CardView = {
  id: string;
  label: ReactNode;
  content: ReactNode;
  empty: Pick<EmptyStateProps, "title" | "description">;
  isEmpty: boolean;
};
export type CardViewTabsProps<Views extends readonly CardView[] = readonly CardView[]> = {
  label: string;
  views: Views;
  selectedKey: NoInfer<Views[number]["id"]>;
  onSelectionChange: (key: Views[number]["id"]) => void;
} & Omit<ComponentPropsWithRef<"div">, "children">;

export function CardViewTabs<const Views extends readonly CardView[]>({
  label,
  views,
  selectedKey,
  onSelectionChange,
  className,
  ...props
}: CardViewTabsProps<Views>) {
  const ids = new Set(views.map((view) => view.id));
  if (ids.size !== views.length || views.some((view) => !view.id.trim()))
    throw new Error("Card tab IDs must be nonempty and unique.");
  if (!ids.has(selectedKey)) throw new Error(`Unknown card tab: ${selectedKey}.`);
  return (
    <div {...props} className={classNames("altertable-card-view-tabs", className)}>
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
