import type { ComponentPropsWithRef } from "react";
import {
  Button as AriaButton,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";
import { IconButton } from "./IconButton.tsx";
import { AppIcon } from "./icons.ts";
import { classNames } from "./classNames.ts";
import "./LiveControl.css";

export type LiveIntervalSeconds = 30 | 60 | 300;

const intervals = [
  { seconds: 30, label: "Every 30 seconds", description: "every 30 seconds" },
  { seconds: 60, label: "Every minute", description: "every minute" },
  { seconds: 300, label: "Every 5 minutes", description: "every 5 minutes" },
] as const;

export type LiveControlProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  intervalSeconds: LiveIntervalSeconds;
  onIntervalChange: (seconds: LiveIntervalSeconds) => void;
} & Omit<ComponentPropsWithRef<"button">, "children" | "onClick" | "onChange">;

/** Toggle an app-owned recurring refresh. The app supplies the timer and its cadence. */
export function LiveControl({
  enabled,
  onChange,
  intervalSeconds,
  onIntervalChange,
  className,
  ...props
}: LiveControlProps) {
  const frequency = intervals.find((interval) => interval.seconds === intervalSeconds)?.description;
  if (!frequency) throw new Error("LiveControl requires a supported update interval.");
  return (
    <div className={classNames("altertable-live-control", className)} data-active={enabled}>
      <IconButton
        {...props}
        icon="live"
        variant="ghost"
        label={props["aria-label"] ?? (enabled ? "Pause live updates" : "Start live updates")}
        aria-pressed={enabled}
        onClick={() => onChange(!enabled)}
      />
      <Select
        aria-label={`Live update frequency: ${frequency}`}
        selectedKey={String(intervalSeconds)}
        onSelectionChange={(key) => {
          const interval = intervals.find((option) => option.seconds === Number(key));
          if (interval) onIntervalChange(interval.seconds);
        }}
        className="altertable-live-frequency"
      >
        <AriaButton aria-label={`Live update frequency: ${frequency}`}>
          <SelectValue className="altertable-visually-hidden" />
          <AppIcon name="disclosure" size={14} />
        </AriaButton>
        <Popover placement="bottom end" className="altertable-live-frequency-popover">
          <ListBox aria-label="Live update frequency">
            {intervals.map((interval) => (
              <ListBoxItem
                key={interval.seconds}
                id={String(interval.seconds)}
                textValue={interval.label}
              >
                {interval.label}
                <AppIcon name="check" size={15} />
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </Select>
    </div>
  );
}
