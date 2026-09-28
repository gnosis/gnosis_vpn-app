import type { JSX } from "solid-js";

/** Inline value that a click selects whole; drag-selection is blocked so it can't spill into neighbouring text. */
export default function SelectableValue(props: { children: JSX.Element }) {
  const selectContents = (
    e: MouseEvent & { currentTarget: HTMLSpanElement },
  ) => {
    e.preventDefault();
    const selection = globalThis.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(e.currentTarget);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  return (
    <span class="select-all cursor-text" onMouseDown={selectContents}>
      {props.children}
    </span>
  );
}
