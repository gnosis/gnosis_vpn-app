import { createSignal, createUniqueId, type JSX, Show } from "solid-js";
import SegmentedControlSwitcher from "./SegmentedControlSwitcher.tsx";
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
  // Tooltip over the switcher only; while it can show, the row tooltip stays hidden.
  tooltipSwitcher?: JSX.Element;
}

export default function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
) {
  const labelId = createUniqueId();
  const descId = createUniqueId();
  // While the pointer/focus is on the switcher its own tooltip shows,
  // so the row-level tooltip must stay hidden.
  const [overSwitcher, setOverSwitcher] = createSignal(false);

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
          <span id={descId} class="text-xs text-text-secondary">
            {props.description}
          </span>
        </Show>
      </div>
      <div
        onMouseEnter={() => setOverSwitcher(true)}
        onMouseLeave={() => setOverSwitcher(false)}
        onFocusIn={() => setOverSwitcher(true)}
        onFocusOut={() => setOverSwitcher(false)}
      >
        <SegmentedControlSwitcher
          options={props.options}
          value={props.value}
          onChange={props.onChange}
          disabled={props.disabled}
          ariaLabelledBy={labelId}
          ariaDescribedBy={props.description ? descId : undefined}
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
        disabled={overSwitcher()}
      >
        {row}
      </Tooltip>
    );
  }
  return row;
}
