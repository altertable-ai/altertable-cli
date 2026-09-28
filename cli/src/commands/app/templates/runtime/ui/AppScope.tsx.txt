import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./AppScope.css";

export type AppScopeProps = {
  organization: string;
  environment: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Identifies the data context without making each app invent its own header badge. */
export function AppScope({
  organization,
  environment,
  children,
  className,
  ...props
}: AppScopeProps) {
  return (
    <div {...props} className={classNames("altertable-app-scope", className)}>
      <span className="altertable-app-scope-organization">{organization}</span>
      <span className="altertable-app-scope-environment">{environment}</span>
      {children}
    </div>
  );
}
