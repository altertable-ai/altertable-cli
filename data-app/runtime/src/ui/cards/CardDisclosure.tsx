import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import { AppIcon } from "../primitives/icons.ts";
import "./CardDisclosure.css";

export type CardDisclosureProps = {
  label: ReactNode;
  children: ReactNode;
} & Omit<ComponentPropsWithRef<"details">, "children">;

/** A compact card action that reveals supporting detail without leaving the view. */
export function CardDisclosure({ label, children, className, ...props }: CardDisclosureProps) {
  return (
    <details {...props} className={classNames("altertable-card-disclosure", className)}>
      <summary>
        {label}
        <AppIcon name="disclosure" size={16} />
      </summary>
      <div className="altertable-card-disclosure-content">{children}</div>
    </details>
  );
}
