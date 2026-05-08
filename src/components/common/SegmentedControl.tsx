import { For } from "solid-js";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

export default function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
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

  return (
    <div
      role="radiogroup"
      aria-label={props.ariaLabel}
      aria-labelledby={props.ariaLabelledBy}
      aria-disabled={props.disabled || undefined}
      class={`flex gap-0.5 bg-bg-surface border border-border rounded-lg p-0.5 ${
        props.disabled ? "opacity-50 cursor-not-allowed" : ""
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
              tabindex={selected() ? 0 : -1}
              class={`px-3 py-1 text-sm rounded-md transition-colors ${
                disabled()
                  ? "text-text-secondary opacity-50 cursor-not-allowed"
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
}
