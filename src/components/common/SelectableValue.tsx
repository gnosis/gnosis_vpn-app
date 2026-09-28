import { onCleanup } from "solid-js";
import type { JSX } from "solid-js";

type Caret = { node: Node; offset: number };

function caretFromPoint(x: number, y: number): Caret | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(x, y);
    return pos && { node: pos.offsetNode, offset: pos.offset };
  }
  const range = document.caretRangeFromPoint(x, y);
  return range && { node: range.startContainer, offset: range.startOffset };
}

function caretIn(el: HTMLElement, x: number, y: number): Caret | null {
  const caret = caretFromPoint(x, y);
  if (!caret || el.contains(caret.node)) return caret;
  const before = el.compareDocumentPosition(caret.node) &
    Node.DOCUMENT_POSITION_PRECEDING;
  return { node: el, offset: before ? 0 : el.childNodes.length };
}

/** Inline value selectable by double-click or drag; the selection never leaves it. */
export default function SelectableValue(props: { children: JSX.Element }) {
  let stopDrag: (() => void) | undefined;
  onCleanup(() => stopDrag?.());

  const onMouseDown = (e: MouseEvent & { currentTarget: HTMLSpanElement }) => {
    if (e.button !== 0) return;
    e.preventDefault();
    stopDrag?.();
    const el = e.currentTarget;
    const selection = globalThis.getSelection();
    if (!selection) return;
    if (e.detail >= 2) {
      selection.selectAllChildren(el);
      return;
    }
    selection.removeAllRanges();
    const anchor = caretIn(el, e.clientX, e.clientY);
    if (!anchor) return;

    const onMove = (m: MouseEvent) => {
      const focus = caretIn(el, m.clientX, m.clientY);
      if (!focus) return;
      selection.setBaseAndExtent(
        anchor.node,
        anchor.offset,
        focus.node,
        focus.offset,
      );
    };
    const stop = () => {
      globalThis.removeEventListener("mousemove", onMove);
      globalThis.removeEventListener("mouseup", stop);
      stopDrag = undefined;
    };
    stopDrag = stop;
    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", stop);
  };

  return (
    <span class="select-text cursor-text" onMouseDown={onMouseDown}>
      {props.children}
    </span>
  );
}
