import { useEffect, useState } from "react";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "react-aria-components/Tabs";
import { searchParams, subscribeSearch, writeSearch } from "./search.ts";
import "./Tabs.css";

/** React Aria tabs with keyboard and ARIA behavior; pair each Tab and TabPanel by stable id. */
export { Tabs, TabList, Tab, TabPanels, TabPanel };

/** Keep a page-level tab in `?view=`; reserve `?tab=` for the inspect sheet. */
export function useViewTab<View extends string>(
  views: readonly View[],
  fallback: View,
): [View, (key: string | number) => void] {
  function currentView(): View {
    const requested = searchParams().get("view") as View;
    return views.includes(requested) ? requested : fallback;
  }
  const [selected, setSelected] = useState<View>(currentView);
  useEffect(() => {
    function sync() {
      const view = currentView();
      setSelected(view);
      if (searchParams().get("view") !== view) writeSearch({ view });
    }
    sync();
    return subscribeSearch(sync);
  }, [views, fallback]);
  function select(key: string | number) {
    const view = String(key) as View;
    if (!views.includes(view)) return;
    setSelected(view);
    writeSearch({ view }, "push");
  }
  return [selected, select];
}
