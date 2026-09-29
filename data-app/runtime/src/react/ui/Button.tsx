import type { ComponentPropsWithRef } from "react";
import { classNames } from "./classNames.ts";
import "./Button.css";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: "elevated" | "outline" | "ghost";
  size?: "default" | "icon";
};

export function Button({
  className,
  type = "button",
  variant = "outline",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      data-variant={variant}
      data-size={size}
      className={classNames("altertable-button", className)}
    />
  );
}
