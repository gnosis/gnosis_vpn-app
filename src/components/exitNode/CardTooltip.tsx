import { createUniqueId, type JSX } from "solid-js";
import Tooltip from "../common/Tooltip.tsx";

const ACTIVATION_KEYS = new Set(["Enter", " "]);

/**
 * A hover/focus anchor inside a role="button" or role="option" row: its
 * clicks and Enter/Space never reach the row. `tooltip` may be rich JSX; the
 * screen reader gets `description` (or the string tooltip) through
 * aria-describedby, which always resolves because it lives in the DOM.
 */
export default function CardTooltip(props: {
  tooltip: string | JSX.Element;
  description?: string;
  children: JSX.Element;
  class?: string;
  // Passed through to Tooltip: where it opens and how it aligns on the anchor.
  position?: "top" | "bottom" | "auto";
  align?: "center" | "end";
  open?: boolean;
  bubbleClass?: string;
}) {
  const descriptionId = createUniqueId();
  const description = () =>
    props.description ??
      (typeof props.tooltip === "string" ? props.tooltip : "");

  // Enter/Space would activate the row; Space would also scroll.
  const swallowActivation = (e: KeyboardEvent) => {
    if (!ACTIVATION_KEYS.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Tooltip
      content={typeof props.tooltip === "string"
        ? <span>{props.tooltip}</span>
        : props.tooltip}
      triggerClass="w-fit shrink-0"
      position={props.position}
      align={props.align}
      open={props.open}
      bubbleClass={props.bubbleClass}
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
      <span id={descriptionId} class="sr-only">{description()}</span>
    </Tooltip>
  );
}
