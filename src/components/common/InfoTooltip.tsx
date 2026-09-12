import type { JSX } from "solid-js";
import Tooltip from "./Tooltip.tsx";

const ACTIVATION_KEYS = new Set(["Enter", " "]);

/** The ⓘ hover/focus target, exempted from LocationBanner's press-replay by `data-info-icon`. */
export default function InfoTooltip(
  props: { content: JSX.Element; label?: string; class?: string },
) {
  // Enter/Space would bubble into the surrounding role="button" card and connect/toggle it.
  const swallowActivation = (e: KeyboardEvent) => {
    if (ACTIVATION_KEYS.has(e.key)) e.stopPropagation();
  };

  return (
    <Tooltip content={props.content} triggerClass="w-fit shrink-0">
      <span
        class={`cursor-help transition-colors hover:text-text-primary ${
          props.class ?? "text-text-muted"
        }`}
        data-info-icon
        role="img"
        aria-label={props.label ?? "More information"}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={swallowActivation}
        onKeyUp={swallowActivation}
      >
        &#9432;
      </span>
    </Tooltip>
  );
}
