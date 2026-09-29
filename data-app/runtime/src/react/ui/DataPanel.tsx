import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { formatCount } from "../../core/format.ts";
import { AppIcon } from "./icons.ts";
import { AboutData, type AboutSubject } from "./AboutData.tsx";
import { Button } from "./Button.tsx";
import { classNames } from "./classNames.ts";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import "./Inspect.css";
import "./DataPanel.css";

export type DataPanelAbout = Omit<AboutSubject, "title" | "description">;

export type DataPanelProps = {
  title: ReactNode;

  count?: number;
  description?: ReactNode;
  about?: DataPanelAbout;
  action?: ReactNode;
  status?: { kind: "updating" | "error"; message: string; onRetry?: () => void };
  footer?: ReactNode;
  /** Valid result with no data to visualize. Supersedes children, including in the inspect sheet. */
  empty?: Pick<EmptyStateProps, "title" | "description">;

  bodyPadding?: "inset" | "flush";
  children: ReactNode;
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

/**
 * `about` opens inspection for this panel. Help stays visible on touch and appears on hover or
 * focus with fine pointers.
 */
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
