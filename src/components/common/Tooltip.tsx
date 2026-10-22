import {
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import { Portal } from "solid-js/web";
import { gateOnWindowFocus } from "@src/utils/windowFocus.ts";

const MARGIN = 8; // min gap from viewport edge
const ARROW_INSET = 8; // min px from bubble edge to arrow center

type Side = "top" | "bottom";

export default function Tooltip(props: {
  content: JSX.Element;
  children: JSX.Element;
  // "auto" prefers below and flips above when the bubble would not fit below.
  position?: Side | "auto";
  // "end" puts the bubble's right edge on the trigger's right edge; the arrow still points at the trigger.
  align?: "center" | "end";
  tabIndex?: number;
  // When true the tooltip never shows (and hides if already visible).
  disabled?: boolean;
  // Shows the tooltip as if hovered, after the same delay; hover still works alongside.
  open?: boolean;
  // Extra classes for the trigger wrapper, replacing the default `w-fit`
  // (e.g. `w-full` when the trigger should span its row).
  triggerClass?: string;
  // Extra classes for the bubble, e.g. a wider max width.
  bubbleClass?: string;
  // id for the bubble, so a trigger can point at it with aria-describedby.
  id?: string;
}) {
  const [visible, setVisible] = createSignal(false);
  const [triggerRect, setTriggerRect] = createSignal<DOMRect | null>(null);
  const [side, setSide] = createSignal<Side>("top");
  const [left, setLeft] = createSignal(-9999); // off-screen until measured
  const [arrowOffset, setArrowOffset] = createSignal(0);
  const [remeasure, setRemeasure] = createSignal(0); // bumped to force re-measure on reposition

  let triggerRef!: HTMLDivElement;
  let bubbleRef!: HTMLDivElement;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timeout));

  const preferred = () => props.position ?? "top";

  const updateAnchor = () => {
    setTriggerRect(triggerRef.getBoundingClientRect());
    setRemeasure((n) => n + 1);
  };

  // After the bubble renders (or on reposition), measure it and settle side, left and arrowOffset.
  createEffect(() => {
    if (!visible() || !bubbleRef) return;
    remeasure(); // track for re-runs triggered by scroll/resize
    const rect = triggerRect();
    if (!rect) return;
    const bw = bubbleRef.offsetWidth;
    const bh = bubbleRef.offsetHeight;
    const pref = preferred();
    if (pref === "auto") {
      const fitsBelow =
        rect.bottom + MARGIN + bh <= globalThis.innerHeight - MARGIN;
      setSide(fitsBelow ? "bottom" : "top");
    } else {
      setSide(pref);
    }
    const half = bw / 2;
    const triggerCenter = rect.left + rect.width / 2;
    const wanted = props.align === "end" ? rect.right - half : triggerCenter;
    const clamped = Math.max(
      half + MARGIN,
      Math.min(wanted, globalThis.innerWidth - half - MARGIN),
    );
    setLeft(clamped);
    const rawOffset = triggerCenter - clamped;
    const maxOffset = half - ARROW_INSET;
    setArrowOffset(Math.max(-maxOffset, Math.min(rawOffset, maxOffset)));
  });

  const anchorStyle = (): JSX.CSSProperties => {
    const rect = triggerRect();
    if (!rect) return {};
    return side() === "top"
      ? { bottom: `${globalThis.innerHeight - rect.top + MARGIN}px` }
      : { top: `${rect.bottom + MARGIN}px` };
  };

  // Keep position in sync while visible
  createEffect(() => {
    if (!visible()) return;
    globalThis.addEventListener("resize", updateAnchor);
    globalThis.addEventListener("scroll", updateAnchor, true);
    onCleanup(() => {
      globalThis.removeEventListener("resize", updateAnchor);
      globalThis.removeEventListener("scroll", updateAnchor, true);
    });
  });

  // Tracks hover/focus intent even while disabled, so the tooltip can
  // reappear when `disabled` clears without a fresh mouseenter.
  const [wantHover, setWantHover] = createSignal(false);
  const wantVisible = () => wantHover() || props.open === true;

  // Handlers only record intent; the effect below turns intent + `disabled`
  // into actual visibility (with the asymmetric show/hide delays), so each
  // transition runs exactly once.
  const hide = () => setWantHover(false);
  const show = gateOnWindowFocus(() => setWantHover(true), hide);

  createEffect(() => {
    clearTimeout(timeout);
    if (props.disabled) {
      // Force-hide immediately; wantVisible stays intact so the tooltip
      // reappears once re-enabled without a fresh mouseenter.
      setVisible(false);
    } else if (wantVisible()) {
      // untrack: updateAnchor reads props.position, which must not become a
      // dependency of this effect.
      untrack(updateAnchor);
      timeout = setTimeout(() => setVisible(true), 120);
    } else {
      timeout = setTimeout(() => setVisible(false), 100);
    }
  });

  return (
    <div
      ref={triggerRef}
      class={`relative inline-flex ${props.triggerClass ?? "w-fit"}`}
      tabindex={props.tabIndex}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusIn={show}
      onFocusOut={hide}
    >
      {props.children}
      <Show when={visible()}>
        <Portal mount={document.body}>
          <div
            ref={bubbleRef}
            id={props.id}
            role="tooltip"
            class={`fixed z-200 w-max rounded-lg bg-neutral-800 px-3 py-2 shadow-lg text-xs leading-relaxed text-gray-100 -translate-x-1/2 transition-[opacity,scale] duration-150 ease-out starting:opacity-0 starting:scale-95 ${
              props.bubbleClass ?? "max-w-52"
            }`}
            style={{ ...anchorStyle(), left: `${left()}px` }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {props.content}
            <span
              class={`absolute size-2 bg-neutral-800
                ${side() === "top" ? "top-full -mt-1" : "bottom-full -mb-1"}
              `}
              style={{
                left: `calc(50% + ${arrowOffset()}px)`,
                transform: "translateX(-50%) rotate(45deg)",
              }}
            />
          </div>
        </Portal>
      </Show>
    </div>
  );
}
