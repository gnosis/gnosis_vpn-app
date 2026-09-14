import { createUniqueId, type JSX } from "solid-js";
import Tooltip from "./Tooltip.tsx";

const ACTIVATION_KEYS = new Set(["Enter", " "]);

/** The ⓘ hover/focus target, exempted from LocationBanner's press-replay by `data-info-icon`. */
export default function InfoTooltip(
  props: { content: JSX.Element; class?: string },
) {
  const descriptionId = createUniqueId();

  // Enter/Space would bubble into the surrounding role="button" card and connect/toggle it; Space would also scroll.
  const swallowActivation = (e: KeyboardEvent) => {
    if (!ACTIVATION_KEYS.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Tooltip content={props.content} triggerClass="w-fit shrink-0">
      <span
        class={`cursor-help transition-colors hover:text-text-primary ${
          props.class ?? "text-text-muted"
        }`}
        data-info-icon
        role="img"
        aria-label="More information"
        aria-describedby={descriptionId}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={swallowActivation}
        onKeyUp={swallowActivation}
      >
        &#9432;
      </span>
      {/* Always in the DOM so the description resolves on focus; the portalled bubble mounts too late for that. */}
      <span id={descriptionId} class="sr-only">{props.content}</span>
    </Tooltip>
  );
}
