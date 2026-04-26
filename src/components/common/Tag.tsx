import type { JSX } from "solid-js";
import { Show } from "solid-js";

export default function Tag(
  props: { value?: string | null; class?: string; children?: JSX.Element },
) {
  return (
    <Show when={props.value != null || props.children != null}>
      <span
        class={`font-bold inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
          props.class ?? "bg-bg-primary text-text-primary"
        }`}
      >
        {props.children ?? props.value}
      </span>
    </Show>
  );
}
