import { useId, type ReactNode } from "react";
import { SelectionMark } from "./SelectionMark.tsx";
import { classNames } from "./classNames.ts";
import "./Checkbox.css";

export type CheckboxProps = {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: CheckboxProps) {
  const descriptionId = useId();
  return (
    <label className={classNames("altertable-checkbox", className)}>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <SelectionMark selected={checked} />
      <span>
        {label}
        {description && <small id={descriptionId}>{description}</small>}
      </span>
    </label>
  );
}
