import { Show } from "solid-js";

/** A data amount such as "23 GB" with the unit half a space from the number; text without a unit renders as is. */
export default function DataAmount(props: { text: string }) {
  const parts = () => props.text.split(" ");
  return (
    <>
      {parts()[0]}
      <Show when={parts()[1]}>
        {(unit) => (
          <>
            {/* A monospace space is a full glyph wide; at half size it halves the gap, and non-breaking keeps the unit with the number */}
            <span class="text-[50%]">&nbsp;</span>
            {unit()}
          </>
        )}
      </Show>
    </>
  );
}
