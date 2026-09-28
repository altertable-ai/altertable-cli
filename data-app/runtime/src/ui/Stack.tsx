import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./Stack.css";

export type StackProps = {
  children: ReactNode;
  gap?: "sm" | "md" | "lg";
} & Omit<ComponentPropsWithRef<"div">, "children">;

export function Stack({ children, gap = "md", className, ...props }: StackProps) {
  return (
    <div {...props} className={classNames("altertable-stack", className)} data-gap={gap}>
      {children}
    </div>
  );
}
