import type { JSX } from "solid-js";
import Tooltip from "../common/Tooltip.tsx";

/** Wraps a setting the client cannot do yet; its control stays disabled. */
export default function FeatureComing(
  props: { children: JSX.Element; class?: string },
) {
  return (
    <Tooltip
      content={<div class="font-bold">Feature coming</div>}
      tabIndex={0}
      triggerClass={props.class}
    >
      {props.children}
    </Tooltip>
  );
}
