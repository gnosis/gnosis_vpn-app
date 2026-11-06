import type { JSX } from "solid-js";

/** Holds the location card's place when there is no exit to show, so the screen never renders blank. */
export default function LocationNotice(
  props: { title: string; children: JSX.Element },
) {
  return (
    <div class="flex flex-col gap-1.5 rounded-[10px] bg-bg-location-card px-3 pt-2.75 pb-3">
      <span class="text-[15px] leading-tight font-bold">{props.title}</span>
      <span class="text-xs text-text-subtle">{props.children}</span>
    </div>
  );
}
