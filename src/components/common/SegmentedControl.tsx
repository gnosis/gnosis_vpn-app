import { For } from "solid-js";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

export default function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
) {
  const buttonRefs: HTMLButtonElement[] = [];

  const selectAt = (idx: number) => {
    const opt = props.options[idx];
    if (!opt) return;
    props.onChange(opt.value);
    buttonRefs[idx]?.focus();
  };

  const moveBy = (delta: number) => {
    const cur = props.options.findIndex((o) => o.value === props.value);
    if (cur === -1) return;
    const len = props.options.length;
    selectAt((cur + delta + len) % len);
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
      class="flex gap-0.5 bg-bg-surface border border-border rounded-lg p-0.5"
    >
      <For each={props.options}>
        {(opt, i) => {
          const selected = () => props.value === opt.value;
          return (
            <button
              ref={(el) => {
                buttonRefs[i()] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected()}
              tabindex={selected() ? 0 : -1}
              class={`px-3 py-1 text-sm rounded-md transition-colors hover:cursor-pointer ${
                selected()
                  ? "bg-accent text-accent-text"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => props.onChange(opt.value)}
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
