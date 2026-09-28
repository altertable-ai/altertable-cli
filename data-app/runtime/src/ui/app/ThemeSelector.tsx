import {
  useCallback,
  useId,
  useSyncExternalStore,
  type ComponentPropsWithRef,
  type ReactNode,
  type RefObject,
} from "react";
import type { ThemeController } from "../../appearance.ts";
import { IconButton } from "../primitives/IconButton.tsx";
import { AppIcon } from "../primitives/icons.ts";
import { classNames } from "../primitives/classNames.ts";
import { Tooltip } from "../primitives/Tooltip.tsx";
import "./ThemeSelector.css";

const modes = [
  { value: "light", label: "Light", icon: "lightTheme" },
  { value: "dark", label: "Dark", icon: "darkTheme" },
] as const;

export type ThemeSelectorProps = {
  theme: ThemeController;
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<"fieldset">, "children">;

function useResolvedTheme(theme: ThemeController) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const preference = window.matchMedia("(prefers-color-scheme: dark)");
      const unsubscribe = theme.subscribe(notify);
      preference.addEventListener("change", notify);
      return () => {
        unsubscribe();
        preference.removeEventListener("change", notify);
      };
    },
    [theme],
  );
  const snapshot = useCallback(() => {
    const mode = theme.getMode();
    return mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  }, [theme]);
  return useSyncExternalStore(subscribe, snapshot, () => "light");
}

/** Viewer color preference. Brand tokens remain app-owned. */
export function ThemeSelector({ theme, children, className, ...props }: ThemeSelectorProps) {
  const selected = useResolvedTheme(theme);
  const name = useId();
  return (
    <fieldset {...props} className={classNames("altertable-theme-selector", className)}>
      <legend className="altertable-theme-legend">Color theme</legend>
      {modes.map(({ value, label, icon }) => (
        <Tooltip key={value} content={`${label} theme`}>
          <label>
            <input
              type="radio"
              name={name}
              value={value}
              checked={selected === value}
              aria-label={`${label} theme`}
              onChange={() => theme.setMode(value)}
            />
            <AppIcon name={icon} size={16} />
          </label>
        </Tooltip>
      ))}
      {children}
    </fieldset>
  );
}

export function ThemeToggle({
  theme,
  portalRoot,
}: {
  theme: ThemeController;
  portalRoot?: RefObject<HTMLElement | null>;
}) {
  const selected = useResolvedTheme(theme);
  const next = selected === "dark" ? "light" : "dark";
  const icon = next === "dark" ? "darkTheme" : "lightTheme";
  return (
    <IconButton
      icon={icon}
      variant="ghost"
      label={`Switch to ${next} theme`}
      portalRoot={portalRoot}
      onClick={() => theme.setMode(next)}
    />
  );
}
