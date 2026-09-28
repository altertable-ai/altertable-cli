import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import "./StorySection.css";

export type StorySectionProps = {
  /** Accessible name for this finding and its evidence. */
  label: string;
  /** The one fact readers should notice first, usually a MetricCard. */
  lead: ReactNode;
  /** Primary chart or other visual evidence for the lead fact. */
  visual: ReactNode;
  /** Optional context that helps interpret the primary visual. */
  support?: ReactNode;
} & Omit<ComponentPropsWithRef<"section">, "children" | "aria-label">;

/** Places a lead fact above primary evidence and a smaller supporting visual. */
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
