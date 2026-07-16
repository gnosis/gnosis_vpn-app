import { createSignal, createUniqueId, type JSX, Show } from "solid-js";
import SegmentedControlSwicher from "./SegmentedControlSwicher.tsx";
import Tooltip from "./Tooltip.tsx";

interface SegmentedControlProps<T extends string> {
  label: string;
  description?: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  // Tooltip over the whole row (shown below it).
  tooltip?: JSX.Element;
  // Tooltip over the swicher only; while it can show, the row tooltip stays hidden.
  tooltipSwitcher?: JSX.Element;
}

export default function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
) {
  const labelId = createUniqueId();
  // While the pointer/focus is on the swicher its own tooltip shows,
  // so the row-level tooltip must stay hidden.
  const [overSwicher, setOverSwicher] = createSignal(false);

  const row = (
    <div
      class={`flex w-full items-center justify-between ${
        props.disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <div class="flex flex-col">
        <span id={labelId} class="text-text-primary">
          {props.label}
        </span>
        <Show when={props.description}>
          <span class="text-xs text-text-secondary">{props.description}</span>
        </Show>
      </div>
      <div
        onMouseEnter={() => setOverSwicher(true)}
        onMouseLeave={() => setOverSwicher(false)}
        onFocusIn={() => setOverSwicher(true)}
        onFocusOut={() => setOverSwicher(false)}
      >
        <SegmentedControlSwicher
          options={props.options}
          value={props.value}
          onChange={props.onChange}
          disabled={props.disabled}
          ariaLabelledBy={labelId}
          tooltipSwitcher={props.tooltipSwitcher}
        />
      </div>
    </div>
  );

  if (props.tooltip !== undefined) {
    return (
      <Tooltip
        content={props.tooltip}
        position="bottom"
        triggerClass="w-full"
        disabled={overSwicher()}
      >
        {row}
      </Tooltip>
    );
  }
  return row;
}
