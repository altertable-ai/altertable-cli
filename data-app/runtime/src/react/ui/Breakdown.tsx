import type { ComponentPropsWithRef, CSSProperties, ReactNode } from "react";
import { formatCount, formatPercent } from "../../core/format.ts";
import { classNames } from "./classNames.ts";
import { chartColor } from "./chartColor.ts";
import "./Breakdown.css";

export type BreakdownItem = { id: string; label: ReactNode; value: number };
export type BreakdownProps = {
  total: number;
  items: readonly BreakdownItem[];
  formatValue?: (value: number) => ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Mutually exclusive parts of one observed whole. Every share uses the supplied total. */
export function Breakdown({
  total,
  items,
  formatValue = formatCount,
  className,
  ...props
}: BreakdownProps) {
  if (
    !Number.isFinite(total) ||
    total < 0 ||
    items.some((item) => !Number.isFinite(item.value) || item.value < 0) ||
    items.reduce((sum, item) => sum + item.value, 0) > total
  )
    throw new Error("Breakdown items must be nonnegative parts of the observed total.");
  const dominant = total > 0 && items.some((item) => item.value / total >= 0.85);
  return (
    <div
      {...props}
      className={classNames("altertable-breakdown", className)}
      data-dominant={dominant || undefined}
    >
      <div className="altertable-breakdown-summary">
        <span>Share of total</span>
        <strong>{formatValue(total)} total</strong>
      </div>
      <div className="altertable-breakdown-bar" aria-hidden="true">
        {items.map((item) => (
          <span
            key={item.id}
            style={{
              width: `${total ? (item.value / total) * 100 : 0}%`,
              backgroundColor: chartColor(item.id),
            }}
          />
        ))}
      </div>
      <dl className="altertable-breakdown-list">
        {items.map((item) => {
          const share = total ? item.value / total : 0;
          const color = {
            "--altertable-breakdown-color": chartColor(item.id),
          } as CSSProperties;
          return (
            <div
              className="altertable-breakdown-row"
              data-empty={item.value === 0 || undefined}
              key={item.id}
              style={color}
            >
              <dt>
                <span className="altertable-breakdown-swatch" aria-hidden="true" />
                {item.label}
              </dt>
              <dd className="altertable-breakdown-value">{formatValue(item.value)}</dd>
              <dd className="altertable-breakdown-share">{formatPercent(share)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
