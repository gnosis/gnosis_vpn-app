import { For, type JSX } from "solid-js";
import Tooltip from "./Tooltip.tsx";

interface SegmentedControlSwitcherProps<T extends string> {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  tooltipSwitcher?: JSX.Element;
}

export default function SegmentedControlSwitcher<T extends string>(
  props: SegmentedControlSwitcherProps<T>,
) {
  const buttonRefs: HTMLButtonElement[] = [];

  const isOptDisabled = (opt: { disabled?: boolean }) =>
    props.disabled || opt.disabled;

  const selectAt = (idx: number) => {
    const opt = props.options[idx];
    if (!opt || isOptDisabled(opt)) return;
    props.onChange(opt.value);
    buttonRefs[idx]?.focus();
  };

  const moveBy = (delta: number) => {
    if (props.disabled) return;
    const cur = props.options.findIndex((o) => o.value === props.value);
    if (cur === -1) return;
    const len = props.options.length;
    for (let step = 1; step <= len; step++) {
      const next = (cur + delta * step + len * step) % len;
      const nextOpt = props.options[next];
      if (nextOpt && !isOptDisabled(nextOpt)) {
        selectAt(next);
        return;
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        moveBy(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        moveBy(-1);
        break;
      case "Home":
        e.preventDefault();
        selectAt(0);
        break;
      case "End":
        e.preventDefault();
        selectAt(props.options.length - 1);
        break;
    }
  };

  const group = (
    <div
      role="radiogroup"
      aria-label={props.ariaLabel}
      aria-labelledby={props.ariaLabelledBy}
      aria-describedby={props.ariaDescribedBy}
      aria-disabled={props.disabled || undefined}
      class={`flex gap-0.5 bg-bg-surface border border-border rounded-lg p-0.5 ${
        props.disabled ? "cursor-not-allowed" : ""
      }`}
    >
      <For each={props.options}>
        {(opt, i) => {
          const selected = () => props.value === opt.value;
          const disabled = () => isOptDisabled(opt);
          return (
            <button
              ref={(el) => {
                buttonRefs[i()] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected()}
              aria-disabled={disabled() || undefined}
              disabled={disabled()}
              tabindex={selected() && !disabled() ? 0 : -1}
              class={`px-3 py-1 text-sm rounded-md transition-colors ${
                disabled()
                  ? selected()
                    ? "bg-gray-400 dark:bg-gray-500 text-white cursor-not-allowed"
                    : "text-text-secondary opacity-50 cursor-not-allowed"
                  : selected()
                  ? "bg-accent text-accent-text hover:cursor-pointer"
                  : "text-text-secondary hover:text-text-primary hover:cursor-pointer"
              }`}
              onClick={() => {
                if (disabled()) return;
                props.onChange(opt.value);
              }}
              onKeyDown={onKeyDown}
            >
              {opt.label}
            </button>
          );
        }}
      </For>
    </div>
  );

  if (props.tooltipSwitcher !== undefined) {
    return (
      <Tooltip content={props.tooltipSwitcher} position="bottom">
        {group}
      </Tooltip>
    );
  }
  return group;
}
