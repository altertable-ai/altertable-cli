import { useCallback, useEffect, useState, type ComponentPropsWithRef } from "react";
import { useMergeRefs } from "@floating-ui/react";
import { classNames } from "./classNames.ts";
import "./GradientScroll.css";

export type GradientScrollProps = ComponentPropsWithRef<"div"> & {
  axis?: "vertical" | "horizontal";
};

type ScrollMetrics = Pick<
  HTMLElement,
  "scrollTop" | "scrollHeight" | "clientHeight" | "scrollLeft" | "scrollWidth" | "clientWidth"
>;

/** The visible edges that still have content beyond them. */
export function scrollFadeEdges(metrics: ScrollMetrics, axis: "vertical" | "horizontal") {
  const position = axis === "vertical" ? metrics.scrollTop : metrics.scrollLeft;
  const viewport = axis === "vertical" ? metrics.clientHeight : metrics.clientWidth;
  const content = axis === "vertical" ? metrics.scrollHeight : metrics.scrollWidth;
  return { start: position > 0, end: position + viewport < content - 1 };
}

/** Fades only scrollable edges; content, size, and scroll changes update the mask. */
export function GradientScroll({
  axis = "vertical",
  className,
  children,
  ref,
  ...props
}: GradientScrollProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const mergedRef = useMergeRefs([setElement, ref]);

  const measure = useCallback(() => {
    if (!element) return;
    const next = scrollFadeEdges(element, axis);
    setEdges((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    );
  }, [element, axis]);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(measure);
    const observeChildren = () => {
      for (const child of element.children) observer.observe(child);
    };
    observer.observe(element);
    observeChildren();
    const mutations = new MutationObserver(() => {
      observeChildren();
      measure();
    });
    mutations.observe(element, { childList: true });
    element.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const frame = requestAnimationFrame(measure);
    const delayed = window.setTimeout(measure, 100);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      mutations.disconnect();
      observer.disconnect();
      element.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [element, measure]);

  return (
    <div
      {...props}
      ref={mergedRef}
      className={classNames("altertable-gradient-scroll", className)}
      data-axis={axis}
      data-fade-start={edges.start ? "" : undefined}
      data-fade-end={edges.end ? "" : undefined}
    >
      {children}
    </div>
  );
}
