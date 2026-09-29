import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./StorySection.css";

export type StorySectionProps = {
  label: string;

  lead: ReactNode;

  visual: ReactNode;

  support?: ReactNode;
} & Omit<ComponentPropsWithRef<"section">, "children" | "aria-label">;

export function StorySection({
  label,
  lead,
  visual,
  support,
  className,
  ...props
}: StorySectionProps) {
  const hasSupport = support != null && support !== false;
  return (
    <section
      {...props}
      aria-label={label}
      className={classNames("altertable-story-section", className)}
    >
      <div className="altertable-story-section-lead">{lead}</div>
      <div className="altertable-story-section-evidence" data-support={hasSupport || undefined}>
        <div className="altertable-story-section-visual">{visual}</div>
        {hasSupport && <aside className="altertable-story-section-support">{support}</aside>}
      </div>
    </section>
  );
}
