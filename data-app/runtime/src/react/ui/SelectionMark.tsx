import "./SelectionMark.css";

/** Decorative selection indicator; the containing control owns its accessible semantics. */
export function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span
      className="altertable-selection-mark"
      data-selected={selected || undefined}
      aria-hidden="true"
    />
  );
}
