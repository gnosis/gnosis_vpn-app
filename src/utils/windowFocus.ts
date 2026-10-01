import { createEffect, createSignal } from "solid-js";

// Optimistic start: headless runs (screenshot shim, tests) never get a real focus event.
const [focused, setFocused] = createSignal(true);
globalThis.addEventListener("focus", () => setFocused(true));
globalThis.addEventListener("blur", () => setFocused(false));

export const isWindowFocused = focused;

/** The one hover rule for every tooltip-like popup: none shows on an unfocused window, blur hides. Returns the gated `show`; call inside a component. */
export function gateOnWindowFocus(show: () => void, hide: () => void) {
  // WebKitGTK keeps reporting hovers on an unfocused window (stale, or from a window above ours).
  createEffect(() => {
    if (!isWindowFocused()) hide();
  });
  return () => {
    if (isWindowFocused()) show();
  };
}
