import type { ComponentPropsWithRef, ReactNode } from "react";
import { AltertableLogo } from "./AltertableLogo.tsx";
import { classNames } from "../primitives/classNames.ts";
import "./AppFooter.css";

export type AppFooterProps = ComponentPropsWithRef<"footer"> & { attribution?: ReactNode };

/** `children` fills the action slot; `attribution` replaces the default link. */
export function AppFooter({ children, attribution, className, ...props }: AppFooterProps) {
  return (
    <footer {...props} className={classNames("altertable-app-footer", className)}>
      <div className="altertable-app-footer-inner">
        <div className="altertable-app-footer-actions">{children}</div>
        {attribution === undefined ? (
          <a
            href="https://altertable.ai/?utm_source=data_app&utm_medium=referral&utm_campaign=powered_by"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Powered by Altertable"
          >
            <span>Powered by</span>
            <AltertableLogo className="altertable-app-footer-logo" />
          </a>
        ) : (
          attribution
        )}
      </div>
    </footer>
  );
}
