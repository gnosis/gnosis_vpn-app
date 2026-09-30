import { createUniqueId, type JSX } from "solid-js";
import Tooltip from "../common/Tooltip.tsx";

const ACTIVATION_KEYS = new Set(["Enter", " "]);

/** A hover/focus anchor inside the role="button" card: its clicks and Enter/Space never reach the card. */
export default function CardTooltip(
  props: { tooltip: string; children: JSX.Element; class?: string },
) {
  const descriptionId = createUniqueId();

  // Enter/Space would connect the card; Space would also scroll.
  const swallowActivation = (e: KeyboardEvent) => {
    if (!ACTIVATION_KEYS.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Tooltip
      content={<span>{props.tooltip}</span>}
      triggerClass="w-fit shrink-0"
    >
      <span
        class={`inline-flex cursor-help ${props.class ?? ""}`}
        data-info-icon
        aria-describedby={descriptionId}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={swallowActivation}
        onKeyUp={swallowActivation}
      >
        {props.children}
      </span>
      {/* Always in the DOM so the description resolves on focus; the portalled bubble mounts too late for that. */}
      <span id={descriptionId} class="sr-only">{props.tooltip}</span>
    </Tooltip>
  );
}
