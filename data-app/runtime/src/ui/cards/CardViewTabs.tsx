import type { ComponentPropsWithRef, ReactNode } from "react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "../controls/Tabs.tsx";
import { classNames } from "../primitives/classNames.ts";
import "./CardViewTabs.css";

export type CardView = { id: string; label: ReactNode; content: ReactNode };
export type CardViewTabsProps = {
  label: string;
  views: CardView[];
  selectedKey: string;
  onSelectionChange: (key: string) => void;
} & Omit<ComponentPropsWithRef<"div">, "children">;

export function CardViewTabs({
  label,
  views,
  selectedKey,
  onSelectionChange,
  className,
  ...props
}: CardViewTabsProps) {
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
              {view.content}
            </TabPanel>
          ))}
        </TabPanels>
      </Tabs>
    </div>
  );
}
