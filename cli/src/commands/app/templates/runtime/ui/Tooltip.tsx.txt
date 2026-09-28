import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  useMergeRefs,
} from "@floating-ui/react";
import { classNames } from "./classNames.ts";
import "./Tooltip.css";

type TooltipTiming = { hoverDelay: () => number; rememberClose: () => void };
const TooltipContext = createContext<TooltipTiming | null>(null);

export type TooltipProviderProps = {
  children: ReactNode;
  delay?: number;
  skipDelayDuration?: number;
};

/** Delay the first hover, then open nearby tooltips without waiting during the skip window.
 * Keyboard focus always opens immediately. AppLayout provides this by default. */
export function TooltipProvider({
  children,
  delay = 500,
  skipDelayDuration = 300,
}: TooltipProviderProps) {
  const skipUntil = useRef(0);
  const timing = useMemo(
    () => ({
      hoverDelay: () => (Date.now() < skipUntil.current ? 0 : delay),
      rememberClose: () => {
        skipUntil.current = Date.now() + skipDelayDuration;
      },
    }),
    [delay, skipDelayDuration],
  );
  return <TooltipContext.Provider value={timing}>{children}</TooltipContext.Provider>;
}

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  variant?: "hint" | "chart";
  align?: "start" | "center" | "end";
  placement?: "top" | "bottom";
  portalRoot?: RefObject<HTMLElement | null>;
  tooltipProps?: Omit<ComponentPropsWithRef<"span">, "children" | "role">;
} & Omit<ComponentPropsWithRef<"span">, "children" | "content">;

/** Short visual hint for an already labeled control. variant="chart" follows the cursor
 * on hover and toggles on tap so a bar or point can show the period and value. Hint
 * tooltips hide once the control is pressed. Escape closes either. */
export function Tooltip({
  content,
  children,
  variant = "hint",
  align = "center",
  placement,
  portalRoot,
  tooltipProps,
  className,
  ref,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
  onFocusCapture,
  onBlurCapture,
  ...props
}: TooltipProps) {
  const timing = useContext(TooltipContext);
  const [open, setOpen] = useState(false);
  const [dialogRoot, setDialogRoot] = useState<HTMLDialogElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressed = useRef(false);
  const side = placement ?? (variant === "chart" ? "top" : "bottom");
  function cancelHover() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  function close() {
    cancelHover();
    if (open) timing?.rememberClose();
    setOpen(false);
  }
  useEffect(() => cancelHover, []);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      suppressed.current = true;
      close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  const { refs, floatingStyles, update } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: align === "center" ? side : `${side}-${align}`,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(variant === "chart" ? 16 : 8), flip(), shift({ padding: 12 })],
  });
  function followCursor(event: { clientX: number; clientY: number }) {
    const { clientX: x, clientY: y } = event;
    refs.setPositionReference({
      getBoundingClientRect: () => ({
        x,
        y,
        top: y,
        left: x,
        right: x,
        bottom: y,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    });
    update();
  }
  useEffect(() => {
    if (!open || variant !== "chart") return;
    function onDocPointerDown(event: PointerEvent) {
      const node = event.target as Node;
      if (refs.domReference.current?.contains(node) || refs.floating.current?.contains(node))
        return;
      close();
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open, variant]);
  const triggerRef = useMergeRefs([
    refs.setReference,
    ref,
    (element: HTMLSpanElement | null) => setDialogRoot(element?.closest("dialog") ?? null),
  ]);
  const floatingRef = useMergeRefs([refs.setFloating, tooltipProps?.ref]);
  return (
    <>
      <span
        {...props}
        ref={triggerRef}
        data-variant={variant}
        className={classNames("altertable-tooltip-trigger", className)}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          if (event.defaultPrevented || event.pointerType !== "mouse" || suppressed.current) return;
          if (variant === "chart") followCursor(event);
          if (open) return;
          cancelHover();
          const delay = variant === "chart" ? 0 : (timing?.hoverDelay() ?? 500);
          if (delay === 0) setOpen(true);
          else
            hoverTimer.current = setTimeout(() => {
              hoverTimer.current = null;
              setOpen(true);
            }, delay);
        }}
        onPointerMove={(event) => {
          onPointerMove?.(event);
          if (event.defaultPrevented || variant !== "chart" || event.pointerType !== "mouse")
            return;
          followCursor(event);
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          suppressed.current = false;
          if (variant === "chart" && event.pointerType !== "mouse") return;
          if (!event.defaultPrevented && !event.currentTarget.contains(document.activeElement))
            close();
          else cancelHover();
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.defaultPrevented) return;
          if (variant === "chart" && event.pointerType !== "mouse") {
            setOpen((wasOpen) => !wasOpen);
            return;
          }
          suppressed.current = true;
          close();
        }}
        onFocusCapture={(event) => {
          onFocusCapture?.(event);
          if (
            event.defaultPrevented ||
            suppressed.current ||
            !event.target.matches(":focus-visible")
          )
            return;
          cancelHover();
          setOpen(true);
        }}
        onBlurCapture={(event) => {
          onBlurCapture?.(event);
          if (event.defaultPrevented || event.currentTarget.contains(event.relatedTarget)) return;
          suppressed.current = false;
          if (!event.currentTarget.matches(":hover")) close();
        }}
      >
        {children}
      </span>
      {open && (
        <FloatingPortal root={portalRoot ?? dialogRoot ?? undefined}>
          <span
            {...tooltipProps}
            ref={floatingRef}
            data-variant={variant}
            className={classNames("altertable-tooltip-content", tooltipProps?.className)}
            style={{ ...tooltipProps?.style, ...floatingStyles }}
            role="tooltip"
          >
            {content}
          </span>
        </FloatingPortal>
      )}
    </>
  );
}
