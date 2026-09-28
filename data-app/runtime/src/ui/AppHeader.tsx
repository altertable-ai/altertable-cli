import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./AppHeader.css";

export type AppHeaderProps = {
  scope?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
  headingProps?: Omit<ComponentPropsWithRef<"div">, "children">;
} & Omit<ComponentPropsWithRef<"header">, "children" | "title">;

export function AppHeader({
  scope,
  title,
  description,
  toolbar,
  children,
  headingProps,
  className,
  ...props
}: AppHeaderProps) {
  return (
    <header {...props} className={classNames("altertable-app-header", className)}>
      <div
        {...headingProps}
        className={classNames("altertable-app-header-heading", headingProps?.className)}
      >
        <div className="altertable-app-header-copy">
          <div className="altertable-app-header-identity">
            <h1>{title}</h1>
            {scope && (
              <div className="altertable-app-header-context">
                <span className="altertable-app-header-connector" aria-hidden="true">
                  /
                </span>
                {scope}
              </div>
            )}
          </div>
          {description && <p>{description}</p>}
          {children}
        </div>
        {toolbar && <div className="altertable-app-header-toolbar">{toolbar}</div>}
      </div>
    </header>
  );
}
