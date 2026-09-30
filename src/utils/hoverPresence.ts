import { createSignal } from "solid-js";

// Optimistic start: headless runs (screenshot shim, tests) never get a real focus event.
const [focused, setFocused] = createSignal(true);
globalThis.addEventListener("focus", () => setFocused(true));
globalThis.addEventListener("blur", () => setFocused(false));

// A fresh object per move, so effects that read it re-run on every move.
const [lastPointer, setLastPointer] = createSignal({ x: 0, y: 0 });
globalThis.addEventListener(
  "mousemove",
  (e) => setLastPointer({ x: e.clientX, y: e.clientY }),
);

export const isWindowFocused = focused;

/** Last viewport position the DOM saw the pointer at. */
export const lastPointerPosition = lastPointer;
