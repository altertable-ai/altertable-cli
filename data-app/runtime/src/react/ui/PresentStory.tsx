import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useMergeRefs } from "@floating-ui/react";
import type { DisclosedQuery } from "../../core/contract.ts";
import type { ThemeController } from "../../core/appearance.ts";
import { AboutData, type AboutEmpty } from "./AboutData.tsx";
import type { DataContext } from "./data-context.ts";
import { AppIcon } from "./icons.ts";
import { IconButton } from "./IconButton.tsx";
import { classNames } from "./classNames.ts";
import { subscribeSearch, writeSearch } from "./search.ts";
import { isEditingTarget, shortcuts, useShortcut } from "./shortcuts.ts";
import { Tooltip } from "./Tooltip.tsx";
import { ThemeToggle } from "./ThemeSelector.tsx";
import "./PresentStory.css";

export type StoryStep = {
  id: string;
  empty?: AboutEmpty;
  headline: string;
  context?: string;
  glossaryIds?: string[];
  queryNames?: string[];
  visual: ReactNode;
  visualKind?: "metric" | "chart";
  queries?: DisclosedQuery[];
};

export type PresentStoryProps = {
  title: string;
  steps: StoryStep[];
  empty?: AboutEmpty;
  scope?: ReactNode;
  dataContext: DataContext;
  theme?: ThemeController;
  launcherProps?: Omit<ComponentPropsWithRef<"span">, "children">;
  dialogProps?: Omit<ComponentPropsWithRef<"dialog">, "children" | "aria-labelledby" | "open">;
  headerActions?: ReactNode;
  footer?: ReactNode;
} & Omit<ComponentPropsWithRef<"button">, "title">;

const stepKeys: Record<string, (index: number, last: number) => number> = {
  ArrowRight: (index) => index + 1,
  PageDown: (index) => index + 1,
  ArrowLeft: (index) => index - 1,
  PageUp: (index) => index - 1,
  Home: () => 0,
  End: (_, last) => last,
};

/**
 * Uses an already loaded snapshot. Navigation is stored in `?present=1&step=`, and step
 * inspection uses `?about=`. `launcherProps` targets the outer span; `dialogProps` targets the
 * modal.
 */
export function PresentStory({
  title,
  steps,
  empty,
  scope,
  dataContext,
  theme,
  launcherProps,
  dialogProps,
  headerActions,
  footer,
  children,
  className,
  onClick,
  disabled,
  ref,
  ...props
}: PresentStoryProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headline = useRef<HTMLHeadingElement>(null);
  const headlineId = useId();
  const contextId = useId();
  const [stepId, setStepId] = useState(steps[0]?.id);
  const triggerRef = useMergeRefs([trigger, ref]);
  const dialogRef = useMergeRefs([dialog, dialogProps?.ref]);
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === stepId),
  );
  const step = steps[index];
  const stepIds = steps.map((item) => item.id).join("\u0000");
  const unavailable = !steps.length || !!disabled;
  const currentSteps = useEffectEvent(() => steps);

  useEffect(() => {
    function syncFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const availableSteps = currentSteps();
      if (params.get("present") === "1" && availableSteps.length) {
        const requested = params.get("step");
        setStepId(
          availableSteps.find((item) => item.id === requested)?.id ?? availableSteps[0]!.id,
        );
        if (!dialog.current?.open) dialog.current?.showModal();
      } else if (dialog.current?.open) {
        dialog.current.close();
      }
    }
    syncFromUrl();
    return subscribeSearch(syncFromUrl);
  }, [stepIds]);

  useEffect(() => {
    if (dialog.current?.open) headline.current?.focus({ preventScroll: true });
  }, [stepId]);

  function writePresentation(id?: string, mode: "replace" | "push" = "replace") {
    writeSearch({ present: id ? "1" : null, step: id ?? null }, mode);
  }

  function open() {
    if (unavailable) return;
    setStepId(steps[0]!.id);
    dialog.current?.showModal();
    headline.current?.focus({ preventScroll: true });
    writePresentation(steps[0]!.id, "push");
  }

  useShortcut(shortcuts.playStory, open, !unavailable);

  function goTo(nextIndex: number) {
    const next = steps[nextIndex];
    if (!next) return;
    setStepId(next.id);
    writePresentation(next.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (
      !(event.target instanceof HTMLElement) ||
      event.target.closest("dialog") !== event.currentTarget
    )
      return;
    const move = stepKeys[event.key];
    if (!move || isEditingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey)
      return;
    event.preventDefault();
    goTo(move(index, steps.length - 1));
  }

  return (
    <>
      <span
        {...launcherProps}
        className={classNames("altertable-present-launch", launcherProps?.className)}
      >
        <IconButton
          {...props}
          ref={triggerRef}
          icon="present"
          variant="elevated"
          label={props["aria-label"] ?? "Present story"}
          shortcut={shortcuts.playStory}
          tooltipAlign="end"
          className={className}
          disabled={unavailable}
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented) open();
          }}
        >
          {children}
        </IconButton>
      </span>
      <dialog
        {...dialogProps}
        ref={dialogRef}
        className={classNames("altertable-present-dialog", dialogProps?.className)}
        aria-labelledby={headlineId}
        aria-describedby={
          dialogProps?.["aria-describedby"] ?? (step?.context ? contextId : undefined)
        }
        onClose={(event) => {
          if (event.target !== event.currentTarget) return;
          if (new URLSearchParams(window.location.search).get("present") === "1")
            writePresentation();
          trigger.current?.focus({ preventScroll: true });
          dialogProps?.onClose?.(event);
        }}
        onKeyDown={(event) => {
          dialogProps?.onKeyDown?.(event);
          if (!event.defaultPrevented) handleKeyDown(event);
        }}
      >
        {step && (
          <div className="altertable-present-shell">
            <header className="altertable-present-header">
              <div className="altertable-present-title">
                <strong>{title}</strong>
                {scope && (
                  <>
                    <span className="altertable-present-connector" aria-hidden="true">
                      /
                    </span>
                    {scope}
                  </>
                )}
              </div>
              <div className="altertable-present-actions">
                <span
                  className="altertable-present-count"
                  aria-label={`Finding ${index + 1} of ${steps.length}`}
                >
                  {index + 1} / {steps.length}
                </span>
                {theme && (
                  <span className="altertable-present-theme">
                    <ThemeToggle theme={theme} portalRoot={dialog} />
                  </span>
                )}
                {headerActions}
                <IconButton
                  icon="close"
                  variant="ghost"
                  label="Exit presentation"
                  shortcut={{ label: "Esc", aria: "Escape" }}
                  tooltipAlign="end"
                  portalRoot={dialog}
                  onClick={() => dialog.current?.close()}
                />
              </div>
            </header>
            <div className="altertable-present-main" key={step.id}>
              <div className="altertable-present-copy">
                <h2 id={headlineId} ref={headline} tabIndex={-1}>
                  {step.headline}
                </h2>
                {step.context && <p id={contextId}>{step.context}</p>}
                <div className="altertable-present-explore">
                  <AboutData
                    shortcut={false}
                    key={step.id}
                    id={step.id}
                    empty={step.empty ?? empty}
                    title={step.headline}
                    description={step.context}
                    visual={step.visual}
                    visualKind={step.visualKind}
                    dataContext={dataContext}
                    glossaryIds={step.glossaryIds}
                    queries={step.queries ?? []}
                    queryNames={step.queryNames}
                    tooltip="Explore this finding"
                    variant="outline"
                    portalRoot={dialog}
                  >
                    <AppIcon name="explore" /> Explore sources
                  </AboutData>
                </div>
              </div>
              <div className="altertable-present-visual" data-kind={step.visualKind}>
                {step.visual}
              </div>
            </div>
            <nav className="altertable-present-nav" aria-label="Story findings">
              <IconButton
                icon="previous"
                variant="ghost"
                label="Previous step"
                shortcut={{ label: "←", aria: "ArrowLeft" }}
                tooltipPlacement="top"
                tooltipAlign="start"
                portalRoot={dialog}
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              />
              <div className="altertable-present-dots">
                {steps.map((item, itemIndex) => (
                  <Tooltip
                    key={item.id}
                    content={item.headline}
                    placement="top"
                    portalRoot={dialog}
                  >
                    <button
                      type="button"
                      aria-label={`Finding ${itemIndex + 1}: ${item.headline}`}
                      aria-current={itemIndex === index ? "step" : undefined}
                      onClick={() => goTo(itemIndex)}
                    />
                  </Tooltip>
                ))}
              </div>
              <IconButton
                icon="next"
                variant="ghost"
                label="Next step"
                shortcut={{ label: "→", aria: "ArrowRight" }}
                tooltipPlacement="top"
                tooltipAlign="end"
                portalRoot={dialog}
                onClick={() => goTo(index + 1)}
                disabled={index === steps.length - 1}
              />
            </nav>
            {footer}
          </div>
        )}
      </dialog>
    </>
  );
}
