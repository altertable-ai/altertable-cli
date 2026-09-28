import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { formatCount } from "../../format.ts";
import { AppIcon } from "../primitives/icons.ts";
import { AboutData, type AboutSubject } from "../inspect/AboutData.tsx";
import { Button } from "../primitives/Button.tsx";
import { classNames } from "../primitives/classNames.ts";
import { EmptyState, type EmptyStateProps } from "../requests/EmptyState.tsx";
import "../inspect/Inspect.css";
import "./DataPanel.css";

export type DataPanelAbout = Omit<AboutSubject, "title" | "description">;

export type DataPanelProps = {
  title: ReactNode;
  /** Count shown beside the title with subdued styling. Zero is shown. */
  count?: number;
  description?: ReactNode;
  about?: DataPanelAbout;
  action?: ReactNode;
  status?: { kind: "updating" | "error"; message: string; onRetry?: () => void };
  footer?: ReactNode;
  /** Valid result with no data to visualize. Supersedes children, including in the inspect sheet. */
  empty?: Pick<EmptyStateProps, "title" | "description">;
  /** Use "flush" for content that intentionally extends to the panel edge. */
  bodyPadding?: "inset" | "flush";
  children: ReactNode;
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

/** A titled surface for a chart, table, or ranked list. `about` opens the inspect sheet
 * for this panel. `action` is a custom header control. Help stays visible on touch and
 * appears on hover or focus on fine pointers. Use `empty` for a valid empty result. */
export function DataPanel({
  title,
  count,
  description,
  about,
  action,
  status,
  footer,
  empty,
  bodyPadding = "inset",
  children,
  className,
  ...props
}: DataPanelProps) {
  const titleId = useId();
  const content = empty ? <EmptyState {...empty} /> : children;
  const help = about && (
    <AboutData
      iconOnly
      variant="ghost"
      className="altertable-inspect-trigger"
      tooltip="Explore this view"
      {...about}
      shortcut={false}
      id={about.id}
      title={title}
      description={description}
      visual={about.visual ?? content}
    >
      <AppIcon name="openDetails" />
    </AboutData>
  );
  return (
    <section
      {...props}
      className={classNames("altertable-data-panel", className)}
      aria-labelledby={props["aria-labelledby"] ?? titleId}
    >
      <header className="altertable-data-panel-header">
        <div>
          <h2 id={titleId}>
            {title}
            {count !== undefined && (
              <span className="altertable-data-panel-count">{formatCount(count)}</span>
            )}
          </h2>
          {description && <p>{description}</p>}
          {status && (
            <div
              className="altertable-data-panel-status"
              data-state={status.kind}
              role={status.kind === "error" ? "alert" : "status"}
            >
              {status.kind === "error" ? (
                <AppIcon name="error" size={14} />
              ) : (
                <AppIcon
                  name="loading"
                  size={14}
                  className="altertable-data-panel-status-spinner"
                />
              )}
              <span>{status.message}</span>
              {status.onRetry && (
                <Button variant="ghost" onClick={status.onRetry}>
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
        {(help || action) && (
          <div className="altertable-data-panel-help">
            {action}
            {help}
          </div>
        )}
      </header>
      <div className="altertable-data-panel-body" data-padding={empty ? "flush" : bodyPadding}>
        {content}
      </div>
      {footer && <footer className="altertable-data-panel-footer">{footer}</footer>}
    </section>
  );
}
