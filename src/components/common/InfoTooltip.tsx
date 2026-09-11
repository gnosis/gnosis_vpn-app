import type { JSX } from "solid-js";
import Tooltip from "./Tooltip.tsx";

/** The ⓘ hover target, exempted from LocationBanner's press-replay by `data-info-icon`. */
export default function InfoTooltip(
  props: { content: JSX.Element; class?: string },
) {
  return (
    <Tooltip content={props.content} triggerClass="w-fit shrink-0">
      <span
        class={`cursor-help transition-colors hover:text-text-primary ${
          props.class ?? "text-text-muted"
        }`}
        data-info-icon
        onClick={(e) => e.stopPropagation()}
      >
        &#9432;
      </span>
    </Tooltip>
  );
}
