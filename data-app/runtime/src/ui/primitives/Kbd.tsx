import type { ComponentPropsWithRef } from "react";
import { classNames } from "./classNames.ts";
import { shortcutLabel, type Shortcut } from "../controls/shortcuts.ts";
import "./Kbd.css";

export type KbdProps = ComponentPropsWithRef<"kbd"> & { shortcut?: Shortcut };

/** A visible key or shortcut. Keep aria-keyshortcuts on the associated control. */
export function Kbd({ shortcut, children, className, ...props }: KbdProps) {
  return (
    <kbd {...props} className={classNames("altertable-kbd", className)}>
      {shortcut ? shortcutLabel(shortcut) : children}
    </kbd>
  );
}
