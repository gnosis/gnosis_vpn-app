import { createUniqueId, type JSX } from "solid-js";
import Tooltip from "../common/Tooltip.tsx";

export const OVERRIDDEN_VALUE = "Overridden by your configuration";
export const CONFIG_ONLY_DESTINATION =
  "This destination comes from your configuration";

const ACTIVATION_KEYS = new Set(["Enter", " "]);

/** Orange marks configuration's hand: wraps an overridden value, or stands alone as a badge (no children). */
export default function ConfigPill(
  props: { tooltip: string; children?: JSX.Element; class?: string },
) {
  const descriptionId = createUniqueId();

  // Enter/Space would bubble into the surrounding role="button" card and connect/toggle it; Space would also scroll.
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
        class={`inline-flex items-center rounded-full bg-vpn-orange px-1.5 text-slate-900 cursor-help ${
          props.class ?? ""
        }`}
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
