import {
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

const MARGIN = 8;
const ARROW_INSET = 8;

type Props = {
  label: string;
  amount: string;
  unit: string;
  status?: "Sufficient" | "Low" | "Empty" | string | null;
  tooltip?: JSX.Element;
  // Rendered right below the status label, e.g. a traffic estimate.
  subline?: JSX.Element;
};

// Returns 4 bare grid cells (label, amount, unit, status) — must be placed
// inside a 4-column grid parent.
export default function FundsInfo(props: Props) {
  const statusColor = () =>
    props.status === "Sufficient"
      ? "text-emerald-600"
      : props.status === "Empty"
      ? "text-red-600"
      : "text-amber-600";

  const [visible, setVisible] = createSignal(false);
  const [triggerX, setTriggerX] = createSignal(0);
  const [anchorBottom, setAnchorBottom] = createSignal(0);
  const [left, setLeft] = createSignal(-9999);
  const [arrowOffset, setArrowOffset] = createSignal(0);
  const [remeasure, setRemeasure] = createSignal(0);

  let unitRef!: HTMLSpanElement;
  let bubbleRef!: HTMLDivElement;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timeout));

  const updateAnchor = () => {
    const rect = unitRef.getBoundingClientRect();
    setTriggerX(rect.left + rect.width / 2);
    setAnchorBottom(globalThis.innerHeight - rect.top + MARGIN);
    setRemeasure((n) => n + 1);
  };

  createEffect(() => {
    if (!visible() || !bubbleRef) return;
    remeasure();
    const half = bubbleRef.offsetWidth / 2;
    const cx = triggerX();
    const clamped = Math.max(
      half + MARGIN,
      Math.min(cx, globalThis.innerWidth - half - MARGIN),
    );
    setLeft(clamped);
    const rawOffset = cx - clamped;
    setArrowOffset(
      Math.max(-(half - ARROW_INSET), Math.min(rawOffset, half - ARROW_INSET)),
    );
  });

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

  const cellClass = (base: string) =>
    props.tooltip ? `${base} cursor-help` : base;

  return (
    <>
      <span class="text-2xl font-bold">{props.label}</span>
      <span
        class={cellClass("text-xl font-semibold font-mono text-right")}
        onMouseEnter={props.tooltip ? show : undefined}
        onMouseLeave={props.tooltip ? hide : undefined}
      >
        {props.amount}
      </span>
      <span
        ref={unitRef}
        class={cellClass("text-xl font-semibold")}
        onMouseEnter={props.tooltip ? show : undefined}
        onMouseLeave={props.tooltip ? hide : undefined}
      >
        {props.unit}
      </span>
      <Show when={props.status}>
        <span
          class={cellClass("flex flex-col items-end text-right")}
          onMouseEnter={props.tooltip ? show : undefined}
          onMouseLeave={props.tooltip ? hide : undefined}
        >
          <span class={`font-bold text-xs ${statusColor()}`}>
            {props.status}
          </span>
          {props.subline}
        </span>
      </Show>
      <Show when={visible() && props.tooltip}>
        <Portal mount={document.body}>
          <div
            ref={bubbleRef}
            class="tooltip-bubble fixed z-200 max-w-52 rounded-lg bg-neutral-800 px-3 py-2 shadow-lg text-xs leading-relaxed text-gray-100"
            style={{
              bottom: `${anchorBottom()}px`,
              left: `${left()}px`,
              transform: "translateX(-50%)",
            }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {props.tooltip}
            <span
              class="absolute size-2 bg-neutral-800 top-full -mt-1"
              style={{
                left: `calc(50% + ${arrowOffset()}px)`,
                transform: "translateX(-50%) rotate(45deg)",
              }}
            />
          </div>
        </Portal>
      </Show>
    </>
  );
}
