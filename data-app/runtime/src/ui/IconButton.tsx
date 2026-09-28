import type { ComponentPropsWithRef, ReactNode, RefObject } from "react";
import { Button, type ButtonProps } from "./Button.tsx";
import { AppIcon, type AppIconName } from "./icons.ts";
import { Kbd } from "./Kbd.tsx";
import { ariaKeyShortcuts, type Shortcut } from "./shortcuts.ts";
import { Tooltip } from "./Tooltip.tsx";

export type IconButtonProps = Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> & {
  icon: AppIconName;
  label: string;
  variant?: ButtonProps["variant"];
  shortcut?: Shortcut | { label: string; aria: string };
  tooltip?: ReactNode;
  portalRoot?: RefObject<HTMLElement | null>;
  tooltipPlacement?: "top" | "bottom";
  tooltipAlign?: "start" | "center" | "end";
  children?: ReactNode;
};

export function IconButton({
  icon,
  label,
  variant = "outline",
  shortcut,
  tooltip,
  portalRoot,
  tooltipPlacement,
  tooltipAlign,
  children,
  type = "button",
  ...props
}: IconButtonProps) {
  const keyHint =
    shortcut &&
    ("modifier" in shortcut ? <Kbd shortcut={shortcut} /> : <Kbd>{shortcut.label}</Kbd>);
  const keyAria = shortcut && ("modifier" in shortcut ? ariaKeyShortcuts(shortcut) : shortcut.aria);
  return (
    <Tooltip
      content={
        tooltip ?? (
          <>
            {label}
            {keyHint && <> {keyHint}</>}
          </>
        )
      }
      portalRoot={portalRoot}
      placement={tooltipPlacement}
      align={tooltipAlign}
    >
      <Button
        {...props}
        type={type}
        variant={variant}
        size="icon"
        aria-label={label}
        aria-keyshortcuts={props["aria-keyshortcuts"] ?? keyAria}
      >
        {children ?? <AppIcon name={icon} />}
      </Button>
    </Tooltip>
  );
}
