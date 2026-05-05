import { For } from "solid-js";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export default function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
) {
  return (
    <div class="flex gap-0.5 bg-bg-surface border border-border rounded-lg p-0.5">
      <For each={props.options}>
        {(opt) => (
          <button
            type="button"
            class={`px-3 py-1 text-sm rounded-md transition-colors hover:cursor-pointer ${
              props.value === opt.value
                ? "bg-accent text-accent-text"
                : "text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => props.onChange(opt.value)}
          >
            {opt.label}
          </button>
        )}
      </For>
    </div>
  );
}
