import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import "./SelectableBarChart.css";

export type SelectableBarItem = { id: string; label: string; value: number };

export type SelectableBarChartProps = {
  items: readonly SelectableBarItem[];
  selectedId: string | null;
  onSelectionChange: (id: string | null) => void;
  unit: string;
  ariaLabel: string;
  formatValue?: (value: number) => string;
};

/** Selection inspects a bar; it never silently filters the rest of the page. */
export function SelectableBarChart({
  items,
  selectedId,
  onSelectionChange,
  unit,
  ariaLabel,
  formatValue = (value) => new Intl.NumberFormat().format(value),
}: SelectableBarChartProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const scrollport = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useLayoutEffect(() => {
    const element = scrollport.current;
    if (element) element.scrollLeft = element.scrollWidth - element.clientWidth;
  }, [items]);
  const selected = items.find((item) => item.id === selectedId);
  const preview = items.find((item) => item.id === previewId) ?? selected ?? items.at(-1);
  const maximum = Math.max(1, ...items.map((item) => item.value));
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape" && selectedId) {
      event.preventDefault();
      onSelectionChange(null);
    }
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
    buttons.current[next]?.focus();
  }
  return (
    <div className="altertable-selectable-bars">
      <div className="altertable-selectable-bars-preview" aria-live="polite">
        {preview ? (
          <span>
            <small>
              {previewId && previewId !== selectedId ? "Preview" : selected ? "Selected" : "Latest"}
            </small>{" "}
            <strong>{preview.label}</strong> · {formatValue(preview.value)} {unit}
          </span>
        ) : (
          <span>No data</span>
        )}
        {selected && (
          <button type="button" onClick={() => onSelectionChange(null)}>
            Clear selection
          </button>
        )}
      </div>
      <div className="altertable-selectable-bars-scroll" ref={scrollport} aria-label={ariaLabel}>
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            className="altertable-selectable-bars-item"
            aria-label={`${item.label}: ${formatValue(item.value)} ${unit}`}
            aria-pressed={selectedId === item.id}
            onClick={() => onSelectionChange(selectedId === item.id ? null : item.id)}
            onMouseEnter={() => setPreviewId(item.id)}
            onMouseLeave={() => setPreviewId(null)}
            onFocus={() => setPreviewId(item.id)}
            onBlur={() => setPreviewId(null)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="altertable-selectable-bars-area">
              <span
                className="altertable-selectable-bars-bar"
                style={{
                  height: `${Math.max(item.value > 0 ? 3 : 0, (item.value / maximum) * 100)}%`,
                }}
              />
            </span>
            <span className="altertable-selectable-bars-label">{item.label}</span>
          </button>
        ))}
      </div>
      <p className="altertable-selectable-bars-help">
        Select a bar to inspect its day. Use arrow keys to move; press Escape to clear.
      </p>
    </div>
  );
}
