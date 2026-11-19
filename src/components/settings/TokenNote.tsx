import type { JSX } from "solid-js";

/** A line under a token; the fixed icon cell keeps its text in place when the arrow becomes a tick. */
export default function TokenNote(
  props: { icon: JSX.Element; children: JSX.Element },
) {
  return (
    <span class="flex items-center gap-1.5 text-xs leading-normal text-text-soft">
      <span class="flex size-3.5 shrink-0">{props.icon}</span>
      <span>{props.children}</span>
    </span>
  );
}
