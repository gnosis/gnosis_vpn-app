import { type JSX, Show } from "solid-js";
import Tooltip from "../common/Tooltip.tsx";

export default function Stat(props: {
  label: string;
  value: string | null;
  valueClass?: string;
  tooltip?: JSX.Element;
  hideLabel?: boolean;
}) {
  return (
    <Show when={props.value}>
      <div class="flex flex-col">
        {/* invisible (not removed) keeps the label line's height so values stay aligned */}
        <span
          class={`text-text-muted inline-flex items-center gap-1${
            props.hideLabel ? " invisible" : ""
          }`}
        >
          {props.label}
          <Show when={props.tooltip}>
            <Tooltip content={props.tooltip!}>
              <span
                class="text-text-muted hover:text-text-primary cursor-help transition-colors"
                data-info-icon
                onClick={(e) => e.stopPropagation()}
              >
                &#9432;
              </span>
            </Tooltip>
          </Show>
        </span>
        <span class={props.valueClass ?? "text-text-primary"}>
          {props.value}
        </span>
      </div>
    </Show>
  );
}
