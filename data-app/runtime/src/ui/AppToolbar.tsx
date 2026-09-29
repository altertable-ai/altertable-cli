import type { ComponentProps, ComponentPropsWithRef, ReactNode } from "react";
import type { DataView } from "./DataBoundary.tsx";
import { LiveControl, type LiveControlProps } from "./LiveControl.tsx";
import { AppIcon } from "./icons.ts";
import { IconButton } from "./IconButton.tsx";
import { PlayStory } from "./PlayStory.tsx";
import { RefreshControl } from "./RefreshControl.tsx";
import { classNames } from "./classNames.ts";
import { shortcuts, useShortcut } from "./shortcuts.ts";
import "./AppToolbar.css";

export type AppToolbarProps = {
  children?: ReactNode;
  end?: ReactNode;
  controlsProps?: Omit<ComponentPropsWithRef<"div">, "children">;
  updatedAt?: ReactNode;
  initialLoading?: boolean;
  requestState?: DataView<unknown, unknown>["kind"];
  refresh?: {
    refreshing: boolean;
    onRefresh: () => void;
    onCancel?: () => void;
    label?: string;
    tooltip?: ReactNode;
    buttonProps?: Omit<ComponentPropsWithRef<"button">, "children" | "onClick">;
    statusProps?: ComponentProps<typeof RefreshControl>["statusProps"];
  };
  live?: LiveControlProps;
  aboutData?: ReactNode;
  story?: ComponentProps<typeof PlayStory>;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Header actions only. Put reader-controlled inputs in DataApp.variables below the header.
 * Observation time, or an initial loading status, sits before Refresh. Children prepend app controls in the right
 * cluster; end follows the built-in actions. Live sits beside Refresh when supplied. Refresh also
 * answers Alt/Option+R and uses the button to cancel a running request when onCancel is provided;
 * refresh.tooltip overrides its static label. All built-in controls are optional. */
export function AppToolbar({
  children,
  updatedAt,
  initialLoading = false,
  requestState,
  refresh,
  live,
  aboutData,
  story,
  end,
  controlsProps,
  className,
  role = "group",
  "aria-label": ariaLabel = "Page actions",
  ...props
}: AppToolbarProps) {
  const refreshLabel =
    refresh?.refreshing && refresh.onCancel
      ? "Cancel refresh"
      : (refresh?.buttonProps?.["aria-label"] ?? "Refresh data");
  function runRefresh() {
    if (refresh && !refresh.refreshing) refresh.onRefresh();
  }
  function activateRefresh() {
    if (!refresh) return;
    if (refresh.refreshing) refresh.onCancel?.();
    else refresh.onRefresh();
  }
  useShortcut(shortcuts.refresh, runRefresh, !!refresh);
  return (
    <div
      {...props}
      className={classNames("altertable-app-toolbar", className)}
      role={role}
      aria-label={ariaLabel}
    >
      <div
        {...controlsProps}
        className={classNames("altertable-app-toolbar-actions", controlsProps?.className)}
      >
        {children}
        {(initialLoading || updatedAt) && (
          <span className="altertable-app-toolbar-updated">
            {initialLoading ? <output>Loading data</output> : updatedAt}
          </span>
        )}
        {refresh && (
          <RefreshControl
            refreshing={refresh.refreshing}
            label={
              requestState === "loading"
                ? "Loading data"
                : requestState === "updating"
                  ? "Updating data"
                  : refresh.label
            }
            statusProps={refresh.statusProps}
          >
            <IconButton
              {...refresh.buttonProps}
              icon="refresh"
              variant="elevated"
              label={refreshLabel}
              shortcut={shortcuts.refresh}
              tooltip={refresh.refreshing && refresh.onCancel ? "Cancel refresh" : refresh.tooltip}
              onClick={activateRefresh}
            >
              <AppIcon name="refresh" className="altertable-refresh-idle" size={17} />
              <AppIcon name="loading" className="altertable-refresh-loading" size={17} />
              {refresh.onCancel && (
                <AppIcon name="cancel" className="altertable-refresh-cancel" size={17} />
              )}
            </IconButton>
          </RefreshControl>
        )}
        {live && <LiveControl {...live} />}
        {aboutData}
        {story && <PlayStory {...story} />}
        {end}
      </div>
    </div>
  );
}
