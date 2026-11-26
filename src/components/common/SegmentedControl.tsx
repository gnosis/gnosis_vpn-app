import { For } from "solid-js";
import { segmentStateClass } from "@src/components/settings/segment.ts";

/** Small pills of which exactly one is pressed, e.g. the exit list's sort order. */
export default function SegmentedControl<T extends string>(props: {
  ariaLabel: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  class?: string;
}) {
  return (
    <div
      role="group"
      aria-label={props.ariaLabel}
      class={`flex shrink-0 gap-0.5 rounded-lg bg-control-bg p-0.5 ${
        props.class ?? ""
      }`}
    >
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            aria-pressed={props.value === option.value}
            class={`rounded-md px-1.5 py-1.25 text-[11px] leading-3.5 font-bold ${
              segmentStateClass(props.value === option.value)
            }`}
            onClick={() => {
              if (option.value !== props.value) props.onChange(option.value);
            }}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}
