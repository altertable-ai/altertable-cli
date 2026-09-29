import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./ExplorationSection.css";

export type ExplorationSectionProps = {
  label: string;

  lead: ReactNode;

  visual: ReactNode;

  support?: ReactNode;
} & Omit<ComponentPropsWithRef<"section">, "children" | "aria-label">;

export function ExplorationSection({
  label,
  lead,
  visual,
  support,
  className,
  ...props
}: ExplorationSectionProps) {
  const hasSupport = support != null && support !== false;
  return (
    <section
      {...props}
      aria-label={label}
      className={classNames("altertable-exploration-section", className)}
    >
      <div className="altertable-exploration-section-lead">{lead}</div>
      <div
        className="altertable-exploration-section-evidence"
        data-support={hasSupport || undefined}
      >
        <div className="altertable-exploration-section-visual">{visual}</div>
        {hasSupport && <aside className="altertable-exploration-section-support">{support}</aside>}
      </div>
    </section>
  );
}
