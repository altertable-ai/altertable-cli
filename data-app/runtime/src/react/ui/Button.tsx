import type { ComponentPropsWithRef } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { classNames } from "./classNames.ts";
import "./Button.css";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: "elevated" | "outline" | "ghost";
  size?: "default" | "compact" | "icon" | "icon-compact";
};

export function Button({
  className,
  type = "button",
  variant = "outline",
  size = "default",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      className={classNames("altertable-button", className)}
    />
  );
}

/** React Aria trigger behavior with the same presentation as the native Button. */
export function PressButton({
  variant = "outline",
  size = "default",
  className,
  ...props
}: Omit<AriaButtonProps, "className"> &
  Pick<ButtonProps, "variant" | "size"> & { className?: string }) {
  return (
    <AriaButton
      {...props}
      data-variant={variant}
      data-size={size}
      className={classNames("altertable-button", className)}
    />
  );
}
