import { type JSX, Show } from "solid-js";
import Tooltip from "../common/Tooltip.tsx";

export default function Stat(props: {
  label: string;
  value: string | null;
  valueClass?: string;
  tooltip?: JSX.Element;
}) {
  return (
    <Show when={props.value}>
      <div class="flex flex-col">
        <span class="text-text-muted inline-flex items-center gap-1">
          {props.label}
          <Show when={props.tooltip}>
            <Tooltip content={props.tooltip!}>
              <span class="text-text-muted hover:text-text-primary cursor-help transition-colors">
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
