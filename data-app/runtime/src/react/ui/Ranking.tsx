import type { ComponentPropsWithRef, ReactNode } from "react";
import { formatCount } from "../../core/format.ts";
import { classNames } from "./classNames.ts";
import "./Ranking.css";

export type RankingItem = { id: string; label: ReactNode; value: number; detail?: ReactNode };
export type RankingProps = {
  items: readonly RankingItem[];
  formatValue?: (value: number) => ReactNode;
} & Omit<ComponentPropsWithRef<"ol">, "children">;

/** Ordered values scaled to the largest visible item, not shares of a whole. */
export function Ranking({ items, formatValue = formatCount, className, ...props }: RankingProps) {
  if (items.some((item) => !Number.isFinite(item.value) || item.value < 0))
    throw new Error("Ranking values must be finite and nonnegative.");
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <ol {...props} className={classNames("altertable-ranking", className)}>
      {items.map((item) => (
        <li key={item.id}>
          <div className="altertable-ranking-reading">
            <span>{item.label}</span>
            <strong>{formatValue(item.value)}</strong>
          </div>
          <div className="altertable-ranking-track" aria-hidden="true">
            <span style={{ width: `${max ? (item.value / max) * 100 : 0}%` }} />
          </div>
          {item.detail != null && <div className="altertable-ranking-detail">{item.detail}</div>}
        </li>
      ))}
    </ol>
  );
}
