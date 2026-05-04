import {
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

const MARGIN = 8; // min gap from viewport edge
const ARROW_INSET = 8; // min px from bubble edge to arrow center

export default function Tooltip(
  props: {
    content: JSX.Element;
    children: JSX.Element;
    position?: "top" | "bottom";
    tabIndex?: number;
  },
) {
  const [visible, setVisible] = createSignal(false);
  const [triggerX, setTriggerX] = createSignal(0);
  const [anchorY, setAnchorY] = createSignal<
    | { bottom: number; top?: never }
    | { top: number; bottom?: never }
  >({ bottom: 0 });
  const [left, setLeft] = createSignal(-9999); // off-screen until measured
  const [arrowOffset, setArrowOffset] = createSignal(0);
  const [remeasure, setRemeasure] = createSignal(0); // bumped to force re-measure on reposition

  let triggerRef!: HTMLDivElement;
  let bubbleRef!: HTMLDivElement;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timeout));

  const pos = () => props.position ?? "top";

  const updateAnchor = () => {
    const rect = triggerRef.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    setTriggerX(cx);
    if (pos() === "top") {
      setAnchorY({
        bottom: globalThis.innerHeight - rect.top + MARGIN,
      });
    } else {
      setAnchorY({ top: rect.bottom + MARGIN });
    }
    setRemeasure((n) => n + 1);
  };

  // After the bubble renders (or on reposition), measure actual width and compute left + arrowOffset
  createEffect(() => {
    if (!visible() || !bubbleRef) return;
    remeasure(); // track for re-runs triggered by scroll/resize
    const bw = bubbleRef.offsetWidth;
    const half = bw / 2;
    const cx = triggerX();
    const clamped = Math.max(
      half + MARGIN,
      Math.min(cx, globalThis.innerWidth - half - MARGIN),
    );
    setLeft(clamped);
    const rawOffset = cx - clamped;
    const maxOffset = half - ARROW_INSET;
    setArrowOffset(Math.max(-maxOffset, Math.min(rawOffset, maxOffset)));
  });

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

  const show = () => {
    clearTimeout(timeout);
    updateAnchor();
    timeout = setTimeout(() => setVisible(true), 120);
  };

  const hide = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => setVisible(false), 100);
  };

  return (
    <div
      ref={triggerRef}
      class="relative inline-flex w-fit"
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
            class="tooltip-bubble fixed z-50 max-w-52 rounded-lg bg-text-primary px-3 py-2 shadow-lg text-xs leading-relaxed text-bg-primary"
            style={{
              ...(anchorY().bottom !== undefined
                ? { bottom: `${anchorY().bottom}px` }
                : { top: `${anchorY().top}px` }),
              left: `${left()}px`,
              transform: "translateX(-50%)",
            }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {props.content}
            <span
              class={`absolute size-2 bg-text-primary
                ${pos() === "top" ? "top-full -mt-1" : "bottom-full -mb-1"}
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
