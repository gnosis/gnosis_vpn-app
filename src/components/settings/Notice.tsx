import type { JSX } from "solid-js";

/** The mock's tinted warning line. */
export default function Notice(
  props: { tone: "warn" | "bad"; children: JSX.Element },
) {
  return (
    <div
      class={`shrink-0 rounded-lg px-2.5 py-2 text-xs leading-[1.45] ${
        props.tone === "bad"
          ? "bg-bad-bg text-bad-ink"
          : "bg-warn-bg text-warn-ink"
      }`}
    >
      {props.children}
    </div>
  );
}
