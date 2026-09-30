import {
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useMergeRefs } from "@floating-ui/react";
import { classNames } from "./classNames.ts";
import { AppIcon } from "./icons.ts";
import { GradientScroll } from "./GradientScroll.tsx";
import "./Sheet.css";

export type SheetDialogProps = Omit<
  ComponentPropsWithRef<"dialog">,
  "children" | "open" | "title" | "aria-labelledby"
>;

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  returnFocus?: RefObject<HTMLElement | null>;
} & SheetDialogProps;

/**
 * Uses the native dialog top layer and focus trap. Closing keeps the modal mounted until its
 * exit transition completes.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  headerActions,
  footer,
  wide,
  returnFocus,
  className,
  onCancel,
  onClose,
  onClick,
  onTransitionEnd,
  ref,
  ...props
}: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useMergeRefs([dialog, ref]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (open) {
      delete element.dataset.closing;
      if (!element.open) element.showModal();
    } else if (element.open) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) element.close();
      else {
        element.dataset.closing = "";
        // Keep the native modal mounted until its exit transition completes.
        closeTimer.current = setTimeout(() => element.close(), 320);
      }
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open]);

  // Native dialog backdrop clicks close the sheet; its contents remain keyboard accessible.
  /* oxlint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
  return (
    <dialog
      {...props}
      ref={dialogRef}
      className={classNames("altertable-sheet", className)}
      data-wide={wide || undefined}
      aria-labelledby={titleId}
      aria-describedby={props["aria-describedby"] ?? (description ? descriptionId : undefined)}
      onCancel={(event) => {
        onCancel?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        onOpenChange(false);
      }}
      onTransitionEnd={(event) => {
        onTransitionEnd?.(event);
        if (event.defaultPrevented) return;
        if (
          event.target !== event.currentTarget ||
          event.propertyName !== "translate" ||
          !("closing" in event.currentTarget.dataset)
        )
          return;
        if (closeTimer.current) clearTimeout(closeTimer.current);
        event.currentTarget.close();
      }}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        delete event.currentTarget.dataset.closing;
        if (open) onOpenChange(false);
        returnFocus?.current?.focus({ preventScroll: true });
        onClose?.(event);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.target !== event.currentTarget) return;
        if (event.clientX < event.currentTarget.getBoundingClientRect().left) onOpenChange(false);
      }}
    >
      <div className="altertable-sheet-shell">
        <header className="altertable-sheet-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <div className="altertable-sheet-actions">
            {headerActions}
            <button
              type="button"
              className="altertable-sheet-close"
              aria-label="Close panel"
              onClick={() => onOpenChange(false)}
            >
              <AppIcon name="close" />
            </button>
          </div>
        </header>
        <GradientScroll className="altertable-sheet-body" fadeStart={false}>
          {children}
        </GradientScroll>
        {footer && <footer className="altertable-sheet-footer">{footer}</footer>}
      </div>
    </dialog>
  );
  /* oxlint-enable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
}
