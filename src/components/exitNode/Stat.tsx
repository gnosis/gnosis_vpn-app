import { type JSX, Show } from "solid-js";
import Tooltip from "../common/Tooltip.tsx";

export default function Stat(props: {
  label: string;
  value: string | null;
  valueClass?: string;
  tooltip?: JSX.Element;
  // When set, the stat always renders (preserving layout space) with this class applied.
  // Use "invisible" to reserve space without showing content.
  class?: string;
}) {
  const shouldRender = () => props.class !== undefined || props.value !== null;

  return (
    <Show when={shouldRender()}>
      <div class={`flex flex-col ${props.class ?? ""}`}>
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
          {/* Non-breaking space keeps the line height when value is hidden */}
          {props.value ?? "\u00A0"}
        </span>
      </div>
    </Show>
  );
}
