import { useState, type ComponentPropsWithRef, type ReactNode, type RefObject } from "react";
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
  type Placement,
} from "@floating-ui/react";
import { classNames } from "./classNames.ts";
import "./HelpPopover.css";
import "./Button.css";

export type HelpPopoverTriggerProps = Omit<ComponentPropsWithRef<"button">, "children" | "type">;
export type HelpPopoverPanelProps = Omit<ComponentPropsWithRef<"section">, "children" | "role">;

export type HelpPopoverProps = {
  trigger: ReactNode;
  triggerLabel: string;
  label: string;
  children: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  placement?: Placement;
  portalRoot?: RefObject<HTMLElement | null>;
  triggerProps?: HelpPopoverTriggerProps;
  panelProps?: HelpPopoverPanelProps;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** A supplemental explanation that opens on click, Enter, or a deliberate mouse hover. Tabbing
 * past the trigger does not open it, and a click keeps a hover-opened panel in place.
 * triggerProps and panelProps target its two surfaces. */
export function HelpPopover({
  trigger,
  triggerLabel,
  label,
  children,
  triggerClassName,
  panelClassName,
  portalRoot,
  triggerProps,
  panelProps,
  placement = "bottom-start",
  open: openProp,
  onOpenChange,
}: HelpPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [dialogRoot, setDialogRoot] = useState<HTMLDialogElement | null>(null);
  const open = openProp ?? uncontrolledOpen;
  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  }
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 12 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      mouseOnly: true,
      delay: { open: 400, close: 120 },
      handleClose: safePolygon(),
    }),
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "dialog" }),
  ]);
  const mergedTriggerRef = useMergeRefs([
    refs.setReference,
    triggerProps?.ref,
    (element: HTMLButtonElement | null) => setDialogRoot(element?.closest("dialog") ?? null),
  ]);
  const mergedPanelRef = useMergeRefs([refs.setFloating, panelProps?.ref]);
  return (
    <>
      <button
        {...getReferenceProps({
          ...triggerProps,
          "aria-label": triggerProps?.["aria-label"] ?? triggerLabel,
        })}
        ref={mergedTriggerRef}
        type="button"
        className={classNames(triggerClassName ?? "altertable-button", triggerProps?.className)}
        data-variant={triggerClassName ? undefined : "outline"}
        data-size={triggerClassName ? undefined : "compact"}
        data-open={open}
      >
        {trigger}
      </button>
      {open && (
        <FloatingPortal root={portalRoot ?? dialogRoot ?? undefined}>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <section
              {...getFloatingProps(panelProps ?? {})}
              ref={mergedPanelRef}
              className={classNames(
                "altertable-help-popover",
                panelClassName,
                panelProps?.className,
              )}
              style={{ ...panelProps?.style, ...floatingStyles }}
              aria-label={panelProps?.["aria-label"] ?? label}
            >
              {children}
            </section>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
